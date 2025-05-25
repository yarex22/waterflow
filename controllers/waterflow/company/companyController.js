const Province = require('../../../models/waterflow/province/ProvinceModel');
const Company = require("../../../models/waterflow/company/CompanyModel");
const ErrorResponse = require("../../../utils/ErrorResponse");
const asyncHandler = require("../../../middleware/asyncHandler");
const logger = require("../../../utils/logger");
const mongoose = require('mongoose');

//create admin
exports.createCompany = asyncHandler(async (req, res, next) => {
  try {
    const {
      name,
      nuit,
      type,
      config,
      address,
      contact,
      logo,
      provinces,
      email
    } = req.body;

    // Validação dos campos obrigatórios usando um objeto para melhor manutenção
    const requiredFields = {
      name: 'Nome da empresa',
      nuit: 'NUIT',
      type: 'Tipo',
      config: 'Configuração',
      address: 'Endereço',
      contact: 'Contato',
      provinces: 'Províncias',
      email: 'Email'
    };

    // Verifica campos vazios com mensagens específicas
    for (const [field, fieldName] of Object.entries(requiredFields)) {
      if (!req.body[field]) {
        return next(new ErrorResponse(`O campo ${fieldName} é obrigatório`, 400));
      }
    }

    // Validação do formato dos IDs das províncias
    if (!Array.isArray(provinces)) {
      return next(new ErrorResponse('O campo provinces deve ser um array', 400));
    }

    if (provinces.length === 0) {
      return next(new ErrorResponse('Deve ser selecionada pelo menos uma província', 400));
    }

    // Add duplicate check
    const uniqueProvinces = [...new Set(provinces)];
    if (uniqueProvinces.length !== provinces.length) {
      return next(new ErrorResponse('Não é permitido duplicar províncias', 400));
    }

    // Validar se todos os IDs são válidos no formato MongoDB
    const isValidMongoId = provinces.every(id => mongoose.Types.ObjectId.isValid(id));
    if (!isValidMongoId) {
      return next(new ErrorResponse('Um ou mais IDs de província são inválidos', 400));
    }

    // Verificar se todas as províncias existem no banco de dados
    const existingProvinces = await Province.find({ _id: { $in: provinces } });

    if (existingProvinces.length !== provinces.length) {
      // Encontrar quais IDs não existem para uma mensagem de erro mais específica
      const existingIds = existingProvinces.map(p => p._id.toString());
      const nonExistingIds = provinces.filter(id => !existingIds.includes(id.toString()));

      logger.warn(`Tentativa de criar empresa com províncias inexistentes: ${nonExistingIds.join(', ')}`);
      return next(new ErrorResponse('Uma ou mais províncias selecionadas não existem no sistema', 400));
    }

    // Validação do contato
    if (isNaN(contact) || contact.toString().length < 9) {
      return next(new ErrorResponse("O número de contato deve ser válido e ter pelo menos 9 dígitos", 400));
    }

    // Validação do email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ErrorResponse("O email fornecido não é válido", 400));
    }

    // Validação do NUIT (assumindo que NUIT tem 9 dígitos em Moçambique)
    if (!/^\d{9}$/.test(nuit)) {
      return next(new ErrorResponse("O NUIT deve conter exatamente 9 dígitos", 400));
    }

    // Verifica se já existe uma empresa com o mesmo NUIT ou email
    const existingCompany = await Company.findOne({
      $or: [
        { nuit: nuit },
        { email: email.toLowerCase() }
      ]
    });

    if (existingCompany) {
      return next(new ErrorResponse(
        "Já existe uma empresa registrada com este NUIT ou email",
        409
      ));
    }

    // Sanitização dos dados
    const sanitizedData = {
      name: name.trim(),
      nuit,
      type: type.trim(),
      config,
      address: address.trim(),
      contact,
      logo,
      provinces,
      email: email.toLowerCase().trim()
    };

    // Cria a empresa com os dados sanitizados
    const company = await Company.create(sanitizedData);

    // Log de operação de negócio
    logger.logBusiness('company_created', {
      companyId: company._id,
      name: company.name,
      nuit: company.nuit,
      provinces: existingProvinces.map(p => ({ id: p._id, name: p.name }))
    });

    res.status(201).json({
      success: true,
      data: company,
      message: "Empresa criada com sucesso"
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse("Erro ao criar empresa", 500));
  }
});

// Buscar empresa por ID
exports.findCompanyById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse("ID de empresa inválido", 400));
    }

    // Buscar empresa com populate das províncias
    const company = await Company.findById(id)
      .populate('provinces', 'name code')
      .select('-__v');

    if (!company) {
      return next(new ErrorResponse("Empresa não encontrada", 404));
    }

    logger.logBusiness('company_viewed', {
      companyId: company._id,
      name: company.name
    });

    res.status(200).json({
      success: true,
      data: company
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse("Erro ao buscar empresa", 500));
  }
});

// Buscar todas as empresas
exports.getAllCompanies = asyncHandler(async (req, res, next) => {
  try {
    const pageSize = Number(req.query.pageSize) || 10;
    const page = Number(req.query.pageNumber) || 1;
    const searchTerm = req.query.searchTerm;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    // Construir query
    const query = {};

    // Adicionar critérios de busca
    if (searchTerm) {
      query.$or = [
        { name: { $regex: searchTerm, $options: "i" } },
        { type: { $regex: searchTerm, $options: "i" } },
        { email: { $regex: searchTerm, $options: "i" } },
        { nuit: { $regex: searchTerm, $options: "i" } },
        { address: { $regex: searchTerm, $options: "i" } }
      ];
    }

    // Adicionar filtro de data
    if (startDate && endDate) {
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999); // Incluir todo o último dia

      if (!isNaN(startDateTime) && !isNaN(endDateTime)) {
        query.createdAt = {
          $gte: startDateTime,
          $lte: endDateTime
        };
      }
    }

    // Contar total de documentos
    const totalCount = await Company.countDocuments(query);

    // Buscar empresas com paginação
    const companies = await Company.find(query)
      .populate('provinces', 'name code')
      .select('-__v')
      .sort({ createdAt: -1 })
      .skip(pageSize * (page - 1))
      .limit(pageSize);

    logger.logBusiness('companies_listed', {
      page,
      pageSize,
      totalCount,
      searchTerm: searchTerm || 'none',
      dateRange: startDate && endDate ? `${startDate} to ${endDate}` : 'none'
    });

    res.status(200).json({
      success: true,
      data: companies,
      pagination: {
        total: totalCount,
        pageSize,
        currentPage: page,
        totalPages: Math.ceil(totalCount / pageSize)
      }
    });
  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse("Erro ao listar empresas", 500));
  }
});

// Editar empresa
exports.editCompany = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      name,
      nuit,
      type,
      config,
      address,
      contact,
      logo,
      provinces,
      email
    } = req.body;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse("ID de empresa inválido", 400));
    }

    // Verificar se a empresa existe
    const existingCompany = await Company.findById(id);
    if (!existingCompany) {
      return next(new ErrorResponse("Empresa não encontrada", 404));
    }

    // Validar campos obrigatórios
    const requiredFields = {
      name: 'Nome da empresa',
      nuit: 'NUIT',
      type: 'Tipo',
      config: 'Configuração',
      address: 'Endereço',
      contact: 'Contato',
      provinces: 'Províncias',
      email: 'Email'
    };

    for (const [field, fieldName] of Object.entries(requiredFields)) {
      if (!req.body[field]) {
        return next(new ErrorResponse(`O campo ${fieldName} é obrigatório`, 400));
      }
    }

    // Validar províncias
    if (!Array.isArray(provinces)) {
      return next(new ErrorResponse('O campo provinces deve ser um array', 400));
    }

    if (provinces.length === 0) {
      return next(new ErrorResponse('Deve ser selecionada pelo menos uma província', 400));
    }

    // Validar IDs das províncias
    const isValidMongoId = provinces.every(id => mongoose.Types.ObjectId.isValid(id));
    if (!isValidMongoId) {
      return next(new ErrorResponse('Um ou mais IDs de província são inválidos', 400));
    }

    // Verificar existência das províncias
    const existingProvinces = await Province.find({ _id: { $in: provinces } });
    if (existingProvinces.length !== provinces.length) {
      const existingIds = existingProvinces.map(p => p._id.toString());
      const nonExistingIds = provinces.filter(id => !existingIds.includes(id.toString()));

      logger.warn(`Tentativa de atualizar empresa com províncias inexistentes: ${nonExistingIds.join(', ')}`);
      return next(new ErrorResponse('Uma ou mais províncias selecionadas não existem no sistema', 400));
    }

    // Validar contato
    if (isNaN(contact) || contact.toString().length < 9) {
      return next(new ErrorResponse("O número de contato deve ser válido e ter pelo menos 9 dígitos", 400));
    }

    // Validar email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return next(new ErrorResponse("O email fornecido não é válido", 400));
    }

    // Validar NUIT
    if (!/^\d{9}$/.test(nuit)) {
      return next(new ErrorResponse("O NUIT deve conter exatamente 9 dígitos", 400));
    }

    // Verificar duplicidade de NUIT e email (excluindo a empresa atual)
    const duplicateCheck = await Company.findOne({
      _id: { $ne: id },
      $or: [
        { nuit: nuit },
        { email: email.toLowerCase() }
      ]
    });

    if (duplicateCheck) {
      return next(new ErrorResponse(
        "Já existe outra empresa registrada com este NUIT ou email",
        409
      ));
    }

    // Sanitizar dados
    const sanitizedData = {
      name: name.trim(),
      nuit,
      type: type.trim(),
      config,
      address: address.trim(),
      contact,
      logo,
      provinces,
      email: email.toLowerCase().trim(),
      updatedAt: new Date()
    };

    // Atualizar empresa
    const updatedCompany = await Company.findByIdAndUpdate(
      id,
      sanitizedData,
      { new: true, runValidators: true }
    ).populate('provinces', 'name code');

    logger.logBusiness('company_updated', {
      companyId: updatedCompany._id,
      name: updatedCompany.name,
      changes: {
        before: {
          name: existingCompany.name,
          provinces: existingCompany.provinces,
          // ... outros campos relevantes
        },
        after: {
          name: updatedCompany.name,
          provinces: updatedCompany.provinces,
          // ... outros campos relevantes
        }
      }
    });

    res.status(200).json({
      success: true,
      data: updatedCompany,
      message: "Empresa atualizada com sucesso"
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse("Erro ao atualizar empresa", 500));
  }
});

// Deletar empresa
exports.deleteCompanyById = asyncHandler(async (req, res, next) => {
  try {
    const { id } = req.params;

    // Validar ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return next(new ErrorResponse("ID de empresa inválido", 400));
    }

    // Verificar se a empresa existe
    const company = await Company.findById(id);
    if (!company) {
      return next(new ErrorResponse("Empresa não encontrada", 404));
    }

    // TODO: Adicionar verificações de dependências
    // Exemplo: Verificar se existem usuários, transações ou outros registros vinculados
    // const hasUsers = await User.exists({ company: id });
    // if (hasUsers) {
    //   return next(new ErrorResponse("Não é possível excluir a empresa pois existem usuários vinculados", 400));
    // }

    // Registrar informações da empresa antes de deletar
    const companyInfo = {
      id: company._id,
      name: company.name,
      nuit: company.nuit,
      email: company.email,
      deletedAt: new Date()
    };

    // Deletar empresa
    await Company.findByIdAndDelete(id);

    logger.logBusiness('company_deleted', companyInfo);

    res.status(200).json({
      success: true,
      message: "Empresa removida com sucesso",
      data: companyInfo
    });

  } catch (error) {
    logger.logError(error, req);
    next(new ErrorResponse("Erro ao remover empresa", 500));
  }
});

