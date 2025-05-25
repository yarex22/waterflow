const User = require("../models/userModel");
const ErrorResponse = require("../utils/ErrorResponse");
// Import required modules
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const asyncHandler = require("../middleware/asyncHandler");
const logger = require("../utils/logger");
const Joi = require('joi');
const jwt = require('jsonwebtoken');
const Company = require("../models/waterflow/company/CompanyModel");

// Configurações e constantes
const COOKIE_OPTIONS = {
  maxAge: 60 * 60 * 1000, // 1 hora
  httpOnly: true, // Previne acesso via JavaScript
  secure: process.env.NODE_ENV === 'production', // Força HTTPS em produção
  sameSite: 'strict', // Proteção contra CSRF
  path: '/',
  domain: process.env.COOKIE_DOMAIN || undefined // Domínio específico
};

// Adicionar configuração de expiração do token
const JWT_OPTIONS = {
  expiresIn: '1h', // Mesmo tempo que o cookie
  algorithm: 'HS512' // Algoritmo mais seguro
};

const MAX_ATTEMPTS = 5;
const LOCK_TIME = 15 * 60 * 1000; // 15 minutos em milissegundos
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

// Rate limiting para tentativas de login
const loginAttempts = new Map();
const attemptsTimeouts = new Map();

const formatTimeRemaining = (ms) => {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) {
    return `${minutes} minuto${minutes > 1 ? 's' : ''}`;
  }
  return `${seconds} segundo${seconds > 1 ? 's' : ''}`;
};

// Versão simplificada e mais robusta do sendTokenResponse
const sendTokenResponse = async (user, statusCode, res) => {
  try {
    await user.populate('company', 'name _id');
    const accessToken = user.getJwtToken();
    const cookieOptions = {
      maxAge: 60 * 60 * 1000, // 1 hora
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      domain: process.env.COOKIE_DOMAIN || undefined
    };

    let companyInfo = null;
    let allCompanies = undefined;
    if (user.role === 'admin') {
      // Admin pode ver todas as empresas
      allCompanies = await Company.find({}, 'name _id');
    } else {
      // Usuário comum só vê sua empresa
      companyInfo = user.company ? {
        id: user.company._id,
        name: user.company.name
      } : null;
    }

    const responseUser = {
      id: user._id,
      role: user.role,
      username: user.username,
      company: user.role === 'admin' ? null : companyInfo
    };
    if (user.role === 'admin') {
      responseUser.allCompanies = allCompanies.map(c => ({ id: c._id, name: c.name }));
    }

    res
      .status(statusCode)
      .cookie('token', accessToken, cookieOptions)
      .json({
        success: true,
        token: accessToken,
        user: responseUser
      });
  } catch (error) {
    logger.error('Erro ao gerar token:', error);
    throw new ErrorResponse('Erro ao gerar token de autenticação', 500);
  }
};

// Controller
const authController = {
    signup: async (req, res, next) => {
      try {
        // Validação de schema usando Joi
        const schema = Joi.object({
          firstName: Joi.string().required().min(2).max(50),
          lastName: Joi.string().required().min(2).max(50),
          email: Joi.string().email().required(),
          password: Joi.string().pattern(PASSWORD_REGEX).required()
            .messages({
              'string.pattern.base': 'A senha deve conter pelo menos 8 caracteres, incluindo maiúsculas, minúsculas, números e caracteres especiais',
              'any.required': 'A senha é obrigatória'
            }),
          gender: Joi.string().valid('M', 'F', 'OTHER').required()
            .messages({
              'any.only': 'Gênero deve ser M, F ou OTHER',
              'any.required': 'Gênero é obrigatório'
            }),
          dob: Joi.date().max('now').iso()
            .messages({
              'date.max': 'A data de nascimento não pode ser no futuro',
              'date.base': 'Data de nascimento inválida'
            }),
          idType: Joi.string().required()
            .messages({
              'any.required': 'Tipo de documento é obrigatório'
            }),
          idNumber: Joi.string().required()
            .messages({
              'any.required': 'Número do documento é obrigatório'
            }),
          address: Joi.string().required()
            .messages({
              'any.required': 'Endereço é obrigatório'
            }),
          contact1: Joi.string().required()
            .messages({
              'any.required': 'Contato principal é obrigatório'
            }),
          contact2: Joi.string(),
          role: Joi.string().valid('user', 'admin').required()
            .messages({
              'any.only': 'Função deve ser user ou admin',
              'any.required': 'Função é obrigatória'
            }),
          username: Joi.string().required().min(3).max(30)
            .messages({
              'string.min': 'Nome de usuário deve ter no mínimo 3 caracteres',
              'string.max': 'Nome de usuário deve ter no máximo 30 caracteres',
              'any.required': 'Nome de usuário é obrigatório'
            })
        });

        const { error, value } = schema.validate(req.body);
        if (error) {
          return next(new ErrorResponse(error.details[0].message, 400));
        }

        // Verificações de duplicidade em paralelo
        const [existingUser, existingEmail] = await Promise.all([
          User.findOne({ username: value.username }),
          User.findOne({ email: value.email })
        ]);

        if (existingUser) {
          return next(new ErrorResponse("Nome de usuário já está em uso", 400));
        }

        if (existingEmail) {
          return next(new ErrorResponse("Email já está cadastrado", 400));
        }

        // Hash da senha com salt dinâmico
        const salt = await bcrypt.genSalt(12);
        const hashedPassword = await bcrypt.hash(value.password, salt);

        const user = await User.create({
          ...value,
          password: hashedPassword,
          active: true,
          lastLogin: new Date()
        });

        // Remover senha do retorno
        user.password = undefined;

        res.status(201).json({
          success: true,
          data: user
        });
      } catch (error) {
        logger.error('Erro no cadastro:', error);
        next(new ErrorResponse("Erro ao realizar o cadastro. Por favor, tente novamente.", 500));
      }
    },

  signin: async (req, res, next) => {
    try {
      const { username, password } = req.body;
      console.log("username, password", username, password);

      if (!username?.trim() || !password?.trim()) {
        return res.status(403).json({
          success: false,
          message: "Por favor, insira usuário e senha",
          details: {
            username: !username?.trim() ? "O nome de usuário é obrigatório" : null,
            password: !password?.trim() ? "A senha é obrigatória" : null
          }
        });
      }

      // Verificar tentativas de login
      const attempts = loginAttempts.get(username) || 0;
      const lockoutTime = attemptsTimeouts.get(username);
      
      if (lockoutTime) {
        const timeRemaining = lockoutTime - Date.now();
        if (timeRemaining > 0) {
          return res.status(429).json({
            success: false,
            message: `Muitas tentativas de login. Por favor, aguarde mais ${formatTimeRemaining(timeRemaining)} antes de tentar novamente.`,
            details: {
              isLocked: true,
              timeRemaining: timeRemaining,
              formattedTime: formatTimeRemaining(timeRemaining)
            }
          });
        } else {
          // Se o tempo expirou, limpar os contadores
          loginAttempts.delete(username);
          attemptsTimeouts.delete(username);
        }
      }

      // Buscar usuário com senha
      const user = await User.findOne({ username })
        .select('+password')
        .exec();

      if (!user) {
        const newAttempts = (loginAttempts.get(username) || 0) + 1;
        loginAttempts.set(username, newAttempts);
        
        if (newAttempts >= MAX_ATTEMPTS) {
          attemptsTimeouts.set(username, Date.now() + LOCK_TIME);
          return res.status(429).json({
            success: false,
            message: `Muitas tentativas de login. Por favor, aguarde ${formatTimeRemaining(LOCK_TIME)} antes de tentar novamente.`,
            details: {
              isLocked: true,
              timeRemaining: LOCK_TIME,
              formattedTime: formatTimeRemaining(LOCK_TIME)
            }
          });
        }
        
        return res.status(400).json({
          success: false,
          message: `Usuário ou senha incorretos`,
          details: {
            attemptsLeft: MAX_ATTEMPTS - newAttempts,
            maxAttempts: MAX_ATTEMPTS,
            isLocked: false
          }
        });
      }

      const isMatched = await bcrypt.compare(password, user.password);

      if (!isMatched) {
        const newAttempts = (loginAttempts.get(username) || 0) + 1;
        loginAttempts.set(username, newAttempts);
        
        if (newAttempts >= MAX_ATTEMPTS) {
          attemptsTimeouts.set(username, Date.now() + LOCK_TIME);
          return res.status(429).json({
            success: false,
            message: `Muitas tentativas de login. Por favor, aguarde ${formatTimeRemaining(LOCK_TIME)} antes de tentar novamente.`,
            details: {
              isLocked: true,
              timeRemaining: LOCK_TIME,
              formattedTime: formatTimeRemaining(LOCK_TIME)
            }
          });
        }
        
        return res.status(400).json({
          success: false,
          message: `Usuário ou senha incorretos`,
          details: {
            attemptsLeft: MAX_ATTEMPTS - newAttempts,
            maxAttempts: MAX_ATTEMPTS,
            isLocked: false
          }
        });
      }

      // Verificar se o usuário está ativo
      if (!user.active) {
        return res.status(401).json({
          success: false,
          message: "Usuário inativo. Por favor, contate o administrador do sistema",
          details: {
            isInactive: true
          }
        });
      }

      // Limpar tentativas de login após sucesso
      loginAttempts.delete(username);
      attemptsTimeouts.delete(username);

      // Atualizar última data de login
      user.lastLogin = new Date();
      await user.save();

      // Enviar resposta com o token
      await sendTokenResponse(user, 200, res);
    } catch (error) {
      logger.error('Erro no login:', error);
      res.status(500).json({
        success: false,
        message: "Erro interno do servidor. Por favor, tente novamente mais tarde.",
        details: {
          isServerError: true
        }
      });
    }
  },

  //find customer by ID
  findUserById: asyncHandler(async (req, res, next) => {
    try {
      const { id } = req.params;

      // Find the customer by ID
      const user = await User.findById(id);

      if (!user) {
        return res.status(404).json({ message: "Usuario nao foi encontrado" });
      }

      res.status(200).json({
        success: true,
        user,
      });
    } catch (error) {
      next(error);
    }
  }),

  logout: async (req, res, next) => {
    try {
      const { refreshToken } = req.cookies;
      
      // Invalidar refresh token no banco
      if (refreshToken) {
        await User.findOneAndUpdate(
          { refreshToken },
          { 
            $set: { 
              refreshToken: null, 
              refreshTokenExpires: null 
            }
          }
        );
      }

      // Limpar todos os cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      res.status(200).json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
    } catch (error) {
      next(new ErrorResponse('Erro ao realizar logout', 500));
    }
  },

  //user profile
  userProfile: async (req, res, next) => {
    // console.log("Received headers:", req.headers);
    const user = await User.findById(req.user.id)
      .sort({ createdAt: -1 })
      .select("-password")
      .populate({
        path: "user",
        select: "firstName lastName email",
      })
    res.status(200).json({
      success: true,
      user,
    });
  },

  userServices: async (req, res, next) => {
    try {
      const user = await User.findById(req.user.id)
        .sort({ createdAt: -1 })
        .select("-password")
        .populate({
          path: "plan",
          populate: {
            path: "planService",
            model: "PlanServices",
          },
        });

      if (user) {
        let planService =
          user.plan && user.plan[0] ? user.plan[0].planService : [];

        // Extract search parameters from the request query
        const {
          serviceName,
          servicePrice,
          serviceDescription,
          serviceAreaOfCover,
        } = req.query;

        // Implement search based on provided parameters
        if (serviceName) {
          planService = planService.filter((service) =>
            service.serviceName.toLowerCase().includes(serviceName.toLowerCase())
          );
        }

        if (servicePrice) {
          planService = planService.filter(
            (service) => service.servicePrice === Number(servicePrice)
          );
        }

        if (serviceDescription) {
          planService = planService.filter((service) =>
            service.serviceDescription
              .toLowerCase()
              .includes(serviceDescription.toLowerCase())
          );
        }

        if (serviceAreaOfCover) {
          planService = planService.filter((service) =>
            service.serviceAreaOfCover
              .toLowerCase()
              .includes(serviceAreaOfCover.toLowerCase())
          );
        }

        // Implement pagination
        const pageSize = Number(req.query.pageSize) || 12;
        const page = Number(req.query.pageNumber) || 1;
        const startIndex = (page - 1) * pageSize;
        const endIndex = page * pageSize;

        const totalServices = planService.length;

        planService = planService.slice(startIndex, endIndex);

        res.status(200).json({
          success: true,
          planService,
          totalServices,
          pageSize,
          currentPage: page,
        });
      } else {
        res.status(404).json({
          success: false,
          error: "User not found",
        });
      }
    } catch (error) {
      next(error);
    }
  },

  // Initiate password reset
  forgotPassword: async (req, res, next) => {
    const { email } = req.body;

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: "Email não encontrado no sistema." });
      }

      // Generate reset token and expiry time
      const resetToken = crypto.randomBytes(20).toString("hex");
      user.resetPasswordToken = resetToken;
      user.resetPasswordExpires = Date.now() + 3600000; // Token expires in 1 hour
      await user.save();

      // Send password reset email
      const resetURL = `http://localhost:8080/reset/${resetToken}`;
      const mailOptions = {
        from: "test@clubedepetroleo.co.mz", // Update with your email
        to: "marcohama32@hotmail.com",
        subject: "Password Reset",
        text: `You are receiving this email because you (or someone else) have requested the reset of the password for your account. Please click on the following link, or paste this into your browser to complete the process:\n\n${resetURL} \n\nIf you did not request this, please ignore this email and your password will remain unchanged.\n`,
      };

      // Create a transporter object using SMTP
      const transporter = nodemailer.createTransport({
        host: "mail.fra2.palosrv.com", // Hostname of the SMTP server
        port: 587, // Port for sending emails (587 for TLS)
        secure: false, // Set to true if you are using port 465 (secure)
        auth: {
          user: "test@clubedepetroleo.co.mz", // Your email address
          pass: "cE^egrq4ETB1", // Your email password
        },
      });

      // Send the email
      await transporter.sendMail(mailOptions);

      res.json({ message: "Email de redefinição de senha enviado com sucesso." });
    } catch (error) {
      if (error.name === "Operation `users.findOne()` buffering timed out after 10000ms") {
        return res
          .status(500)
          .json({ message: "Tempo limite excedido. Por favor, tente novamente." });
      }
      next(new ErrorResponse("Erro ao processar a solicitação de redefinição de senha.", 500));
    }
  },
  // Reset password
  resetPassword: async (req, res, next) => {
    const { token, password } = req.body;

    try {
      const user = await User.findOne({
        resetPasswordToken: token,
        resetPasswordExpires: { $gt: Date.now() },
      });

      if (!user) {
        return res.status(400).json({ 
          message: "Token inválido ou expirado. Por favor, solicite uma nova redefinição de senha." 
        });
      }

      // Update user's password and clear reset token fields
      user.password = password;
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save();

      res.json({ message: "Senha atualizada com sucesso." });
    } catch (error) {
      next(new ErrorResponse("Erro ao redefinir a senha. Por favor, tente novamente.", 500));
    }
  },

  getAllUsers: async (req, res, next) => {
    // console.log("Received headers:", req.headers);
    const user = await User.find().sort({ createdAt: -1 }).select("-password");

    res.status(200).json({
      success: true,
      user,
    });
  },

  refreshToken: async (req, res, next) => {
    try {
      const { refreshToken } = req.cookies;

      if (!refreshToken) {
        return next(new ErrorResponse('Token de atualização não fornecido', 401));
      }

      // Encontrar usuário com refresh token válido
      const user = await User.findOne({
        refreshToken,
        refreshTokenExpires: { $gt: Date.now() }
      });

      if (!user) {
        return next(new ErrorResponse('Token de atualização inválido ou expirado', 401));
      }

      // Gerar novo access token
      const accessToken = await user.getJwtToken();

      // Enviar novo access token
      res
        .cookie('accessToken', accessToken, {
          ...COOKIE_OPTIONS,
          maxAge: 60 * 60 * 1000 // 1 hora
        })
        .json({
          success: true,
          message: 'Token atualizado com sucesso'
        });
    } catch (error) {
      next(new ErrorResponse('Erro ao atualizar token', 500));
    }
  },
};

// Exportar o controller
module.exports = authController;
