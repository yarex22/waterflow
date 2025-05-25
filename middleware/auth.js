const ErrorResponse = require("../utils/ErrorResponse");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel");
const cors = require('cors');

// Check if user is authenticated
exports.isAuthenticated = async (req, res, next) => {
  try {
    // Verificar token no header ou query string (para imagens)
    const token = req.headers.token || req.query.token;

    // Check if token exists
    if (!token) {
      return next(new ErrorResponse("Not authorized: Token not provided", 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id);

    // Check if the user exists
    if (!req.user) {
      return next(new ErrorResponse("Not authorized: Invalid token", 401));
    }

    // Check if the token has expired
    if (decoded.exp < Date.now() / 1000) {
      return next(new ErrorResponse("Not authorized: Token expired", 401));
    }

    next();
  } catch (error) {
    // Clear any stored token or session information
    // For example, you can clear the token from cookies or local storage

    return next(new ErrorResponse("Not authorized: Invalid token", 401));
  }
};

// Middleware for admin
exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return next(new ErrorResponse("Acesso negado: Deves ser um administrador", 401));
  }
  next();
};

// Middleware for manager
exports.isManager = (req, res, next) => {
  if (req.user.role !== 'manager') {
    return next(new ErrorResponse("Acesso negado: Deves ser um gerente", 401));
  }
  next();
};

// Middleware for reader
exports.isReader = (req, res, next) => {
  if (req.user.role !== 'reader') {
    return next(new ErrorResponse("Acesso negado: Deves ser um leitor", 401));
  }
  next();
};

// Middleware for user
exports.isUser = (req, res, next) => {
  if (req.user.role !== 'user') {
    return next(new ErrorResponse("Acesso negado: Deves ser um usuário", 401));
  }
  next();
};

exports.isCustomerManager = async (req, res, next) => {
  try {
    const { id } = req.params;
    const logedUser = req.user;

    const user = await User.findById(id);

    if (!user) {
      return next(new ErrorResponse("Usuário não encontrado", 404));
    }

    if (
      logedUser.role === 1 ||
      logedUser.role === 6 ||
      user.manager.toString() === logedUser.id ||
      user.agent.toString() === logedUser.id
    ) {
      // Allow access for users with role === 1 or the company manager
      next();
    } else {
      return next(
        new ErrorResponse(
          "Acesso negado. Apenas o gerente de cliente ou usuários administradores podem acessar esta conta",
          403
        )
      );
    }
  } catch (error) {
    next(error);
  }
};

exports.isPartner = (req, res, next) => {
  if (req.user.role !== 6 && req.user.role !== 1) {
    return next(new ErrorResponse("Acesso negado: Você não tem acesso", 401));
  }
  next();
};

exports.isTokenValid = async (req, res, next) => {
  try {
    const token = req.headers.token;

    // Check if token exists
    if (!token) {
      throw new Error("Token não fornecido");
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Retrieve user from the database
    const user = await User.findById(decoded.id);

    // Check if the user exists
    if (!user) {
      throw new Error("Usuário não encontrado");
    }

    // Check if the token has expired
    const resetPasswordExpiresMilliseconds = new Date(
      user.resetPasswordExpires
    ).getTime();
    const currentTimeMilliseconds = Date.now() / 1000;

    if (resetPasswordExpiresMilliseconds < currentTimeMilliseconds) {
      throw new Error("Token de redefinição expirado");
      // You can handle the token expiration here
    }

    // Attach the user to the request object for later use
    req.user = user;

    // console.log("User: ", req.user);

    // If all checks pass, move on to the next middleware
    // next();
    if (req.user) {
      return res.status(200).json({ success: true, message: "token é válido" });
    }
  } catch (error) {
    // Handle errors in a centralized error handler or middleware
    // You can send a more descriptive error message if needed
    return res
      .status(401)
      .json({ success: false, message: "Autenticação falhou" });
  }
};

exports.protect = async (req, res, next) => {
  try {
    // Verificar se existe o header Authorization e se começa com Bearer
    if (!req.headers.authorization?.startsWith('Bearer ')) {
      return next(new ErrorResponse('Não autorizado: Use o formato Bearer token', 401));
    }

    // Extrair o token
    const token = req.headers.authorization.split(' ')[1];

    if (!token) {
      return next(new ErrorResponse('Não autorizado: Token não fornecido', 401));
    }

    try {
      // Verificar token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Buscar usuário
      const user = await User.findById(decoded.id).select('-password');

      if (!user) {
        return next(new ErrorResponse('Usuário não encontrado', 401));
      }

      // Verificar se o usuário está ativo
      if (!user.active) {
        return next(new ErrorResponse('Usuário inativo', 401));
      }

      // Adicionar usuário à requisição
      req.user = user;
      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return next(new ErrorResponse('Token inválido', 401));
      }
      if (error.name === 'TokenExpiredError') {
        return next(new ErrorResponse('Token expirado', 401));
      }
      return next(new ErrorResponse('Erro na autenticação', 401));
    }
  } catch (error) {
    return next(new ErrorResponse('Erro no servidor', 500));
  }
};

const refreshAccessToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.cookies;

    const user = await User.findOne({
      refreshToken,
      refreshTokenExpires: { $gt: Date.now() }
    });

    if (!user) {
      return next(new ErrorResponse('Refresh token inválido ou expirado', 401));
    }

    // Gerar novo access token
    const accessToken = user.getJwtToken();

    // Atualizar cookie
    res.cookie('accessToken', accessToken, {
      ...COOKIE_OPTIONS,
      maxAge: 60 * 60 * 1000 // 1 hora
    });

    // Continuar com a requisição
    req.user = user;
    next();
  } catch (error) {
    next(new ErrorResponse('Erro ao atualizar token', 500));
  }
};

const sendTokenResponse = async (user, statusCode, res) => {
  try {
    // Gerar access token
    const accessToken = user.getJwtToken();

    // Enviar resposta apenas com o token no header Authorization
    res
      .status(statusCode)
      .set('Authorization', `Bearer ${accessToken}`)
      .json({
        success: true,
        user: {
          id: user._id,
          role: user.role,
          username: user.username
        }
      });
  } catch (error) {
    logger.error('Erro ao gerar token:', error);
    throw new ErrorResponse('Erro ao gerar token de autenticação', 500);
  }
};

// Novo middleware para verificar se é viewer de relatórios
exports.isReportViewer = (req, res, next) => {
  if (req.user.role !== 'report_viewer' && req.user.role !== 'admin') {
    return next(new ErrorResponse("Acesso negado: Você precisa ser um visualizador de relatórios ou admin", 403));
  }
  next();
};

// Middleware para verificar acesso apenas a relatórios
exports.checkReportOnlyAccess = (req, res, next) => {
  if (req.user.role === 'report_viewer') {
    // Se for report_viewer, só pode acessar rotas de relatório
    if (!req.path.startsWith('/report')) {
      return next(new ErrorResponse("Acesso negado: Você só tem acesso a relatórios", 403));
    }
  }
  next();
};
