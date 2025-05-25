const User = require("../models/userModel");
const ErrorResponse = require("../utils/CustomErrorResponse");
const asyncHandler = require("../middleware/asyncHandler");
const bcrypt = require("bcrypt");
const rateLimit = require('express-rate-limit');

// Configuração do rate limiter
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 60, // limite de 60 requisições por minuto
    message: {
        success: false,
        error: 'Muitas requisições. Por favor, aguarde um momento antes de tentar novamente.'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Listar todos os usuários com paginação e filtro
exports.allUsers = asyncHandler(async (req, res, next) => {
  try {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.page) || 1;
    const searchTerm = req.query.searchTerm;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
    const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

    let query = {};

    // Construir query de busca
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { username: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { contact: { $regex: searchTerm, $options: "i" } },
        { role: { $regex: searchTerm, $options: "i" } }
      ];
    }

    // Adicionar filtro de data se fornecido
    if (startDate && endDate) {
      query.createdAt = {
        $gte: startDate,
        $lte: new Date(endDate.setHours(23, 59, 59))
      };
    }

    // Calcular total de registros
    const total = await User.countDocuments(query);

    // Buscar usuários com paginação
    const users = await User.find(query)
      .select("-password") // Excluir senha dos resultados
      .sort({ createdAt: -1 })
      .skip(pageSize * (page - 1))
      .limit(pageSize);

    // Calcular total de páginas
    const totalPages = Math.ceil(total / pageSize);

    // Retornar resposta formatada
    res.status(200).json({
      success: true,
      users: users,
      page: page,
      pageSize: pageSize,
      total: total,
      totalPages: totalPages
    });

  } catch (error) {
    next(error);
  }
});

// Obter um único usuário pelo ID
exports.singleUser = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return next(new ErrorResponse("Usuário não encontrado", 404));
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

// Obter perfil detalhado de um usuário
exports.singleUserProfile = asyncHandler(async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id)
      .populate("accountOwner manager user myMembers")
      .populate({ path: "plan", populate: { path: "planService", model: "PlanServices" } })
      .select("-password");

    if (!user) return next(new ErrorResponse("Usuário não encontrado", 404));
    res.status(200).json({ success: true, user });
  } catch (error) {
    next(error);
  }
});

// Atualizar um usuário
exports.updateUser = asyncHandler(async (req, res, next) => {
  const id = req.params.id;

  // Verificar se o usuário existe
  let checkUser = await User.findById(id);
  if (!checkUser) {
    return next(new ErrorResponse("Usuário não encontrado", 404));
  }

  // Extrair campos do corpo da requisição
  const { name, username, email, role, password, contact, company, isEmployee } = req.body;

  // Preparar dados para atualização
  let updatedFields = {};

  // Adicionar apenas os campos que foram fornecidos
  if (name) updatedFields.name = name.trim();
  if (username) updatedFields.username = username.trim().toLowerCase();
  if (email) {
    // Validação de email se fornecido
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ErrorResponse("Formato de email inválido", 400));
    }
    updatedFields.email = email.trim().toLowerCase();
  }
  if (role) updatedFields.role = role.trim();
  if (contact) updatedFields.contact = contact.trim();
  if (typeof isEmployee !== 'undefined') updatedFields.isEmployee = !!isEmployee;

  // Tratar company baseado no isEmployee
  if (typeof isEmployee !== 'undefined') {
    if (isEmployee === true && !company) {
      return next(new ErrorResponse("Campo company é obrigatório para funcionários", 400));
    }
    if (isEmployee === true) {
      updatedFields.company = company.trim();
    } else {
      updatedFields.company = undefined;
    }
  } else if (company) {
    updatedFields.company = company.trim();
  }

  // Verificar duplicidade de email ou username apenas se foram fornecidos
  if (email || username) {
    const query = {
      _id: { $ne: id },
      $or: []
    };
    if (email) query.$or.push({ email });
    if (username) query.$or.push({ username });

    if (query.$or.length > 0) {
      const existingUser = await User.findOne(query);
      if (existingUser) {
        let duplicateField = existingUser.email === email ? 'Email' : 'Username';
        return next(new ErrorResponse(`${duplicateField} já está em uso`, 400));
      }
    }
  }

  // Hash da senha se fornecida
  if (password) {
    if (password.length < 8) {
      return next(new ErrorResponse("A senha deve ter pelo menos 8 caracteres", 400));
    }
    updatedFields.password = await bcrypt.hash(password, 12);
  }

  // Atualizar o usuário
  const updatedUser = await User.findByIdAndUpdate(
    id,
    updatedFields,
    { new: true, runValidators: true }
  ).select('-password');

  res.status(200).json({
    success: true,
    message: "Usuário atualizado com sucesso",
    user: updatedUser
  });
});

// Criar um novo usuário
exports.addUser = asyncHandler(async (req, res, next) => {
  const { name, username, email, company, contact, password, role, employee, isEmployee } = req.body;

  // Campos básicos obrigatórios para todos os usuários
  const baseRequiredFields = { name, username, email, contact, password, role };
  let emptyFields = Object.entries(baseRequiredFields)
    .filter(([_, value]) => !value)
    .map(([field]) => field);

  // Se for funcionário, adiciona validação para company e employee
  if (isEmployee) {
    if (!company) emptyFields.push('company');
    if (!employee) emptyFields.push('employee');
  }

  if (emptyFields.length > 0) {
    return next(
      new ErrorResponse(
        `Campos obrigatórios faltando: ${emptyFields.join(', ')}`,
        400
      )
    );
  }

  // Validação de email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return next(new ErrorResponse("Formato de email inválido", 400));
  }

  // Validação de senha
  if (password.length < 8) {
    return next(
      new ErrorResponse("A senha deve ter pelo menos 8 caracteres", 400)
    );
  }

  // Verificar duplicidade de username e email
  const existingUser = await User.findOne({
    $or: [{ email }, { username }]
  });

  if (existingUser) {
    let duplicateField = existingUser.email === email ? 'Email' : 'Username';
    return next(
      new ErrorResponse(
        `${duplicateField} já está em uso`,
        400
      )
    );
  }

  // Se for funcionário, verifica se o número de funcionário já existe
  if (isEmployee && employee) {
    const existingEmployee = await User.findOne({ employee: employee.trim() });
    if (existingEmployee) {
      return next(
        new ErrorResponse("Funcionário já está cadastrado no sistema", 400)
      );
    }
  }

  // Hash da senha com salt maior para mais segurança
  const hashedPassword = await bcrypt.hash(password, 12);

  // Sanitização dos dados antes de criar o usuário
  const sanitizedData = {
    name: name.trim(),
    username: username.trim().toLowerCase(),
    email: email.trim().toLowerCase(),
    contact: contact.trim(),
    password: hashedPassword,
    role: role.trim(),
    active: true,
    isEmployee: !!isEmployee // Garante que seja boolean
  };

  // Adiciona company e employee apenas se for funcionário
  if (isEmployee) {
    sanitizedData.company = company.trim();
    sanitizedData.employee = employee.trim();
  }

  const user = await User.create(sanitizedData);

  // Remover a senha do objeto de resposta
  const userResponse = user.toObject();
  delete userResponse.password;

  res.status(201).json({
    success: true,
    message: "Usuário criado com sucesso",
    user: userResponse
  });
});

// Excluir usuário
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return next(new ErrorResponse("Usuário não encontrado", 404));
  }

  await user.deleteOne();

  res.status(200).json({ success: true, message: "Usuário excluído com sucesso" });
});

// @desc    Buscar perfil do usuário logado
// @route   GET /api/users/profile
exports.userProfile = asyncHandler(async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return next(new ErrorResponse("Não autorizado", 401));
    }

    const user = await User.findOne({
      _id: req.user.id,
      active: true // equivalente ao deleted_at IS NULL
    })
    .select([
      '_id',
      'username',
      'name', // equivalente ao full_name
      'email',
      'contact', // equivalente ao phone_number
      'documentType', // equivalente ao tipo_documento
      'documentNumber', // equivalente ao numero_documento
      'address', // equivalente ao residencia
      'role',
      'active', // equivalente ao is_active
      'isVerified', // equivalente ao is_verified
      'createdAt', // equivalente ao created_at
      'updatedAt', // equivalente ao updated_at
      'lastLogin' // equivalente ao last_login_at
    ])
    .lean(); // Para converter para objeto JavaScript puro

    if (!user) {
      return next(new ErrorResponse("Usuário não encontrado", 404));
    }

    // Formatando a resposta para manter a estrutura esperada
    const formattedUser = {
      id: user._id,
      username: user.username,
      full_name: user.name,
      email: user.email,
      phone_number: user.contact,
      tipo_documento: user.documentType,
      numero_documento: user.documentNumber,
      residencia: user.address,
      role: user.role,
      is_active: user.active,
      is_verified: user.isVerified,
      created_at: user.createdAt,
      updated_at: user.updatedAt,
      last_login_at: user.lastLogin
    };

    return res.status(200).json({
      success: true,
      data: formattedUser
    });
  } catch (error) {
    console.error('Erro ao buscar perfil do usuário:', error);
    return next(new ErrorResponse("Erro ao buscar dados do usuário", 500));
  }
});

exports.handleApiError = (error, defaultMessage) => {
    console.error('Erro na API:', error);
    
    const errorMessage = 
        error.response?.data?.message || // Mensagem do backend
        error.response?.message ||       // Mensagem do axios
        error.message ||                 // Mensagem do erro
        defaultMessage;                  // Mensagem padrão
        
    notify({
        title: "Erro",
        text: errorMessage,
        type: "error",
        duration: 5000
    });
}