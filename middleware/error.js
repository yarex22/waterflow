const ErrorResponse = require("../utils/CustomErrorResponse");

const notFound = (req, res, next) => {
  const error = new Error(`Rota não encontrada - ${req.originalUrl}`);
  error.statusCode = 404;
  error.code = 'NOT_FOUND';
  next(error);
};

const errorHandler = (err, req, res, next) => {
  // Log do erro para desenvolvimento
  console.error('Error Details:', {
    name: err.name,
    message: err.message,
    code: err.code,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Estrutura base da resposta de erro
  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Erro interno do servidor',
      code: err.code || 'SERVER_ERROR',
      status: err.statusCode || 500
    }
  };

  // Adicionar detalhes extras em ambiente de desenvolvimento
  if (process.env.NODE_ENV === 'development') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.details = err;
  }

  // Tratamento específico para diferentes tipos de erro
  switch (err.name) {
    case 'ValidationError':
      errorResponse.error.code = 'VALIDATION_ERROR';
      errorResponse.error.status = 400;
      errorResponse.error.validationErrors = Object.values(err.errors).map(e => ({
        field: e.path,
        message: e.message
      }));
      break;

    case 'CastError':
      errorResponse.error.code = 'INVALID_ID';
      errorResponse.error.status = 400;
      errorResponse.error.message = `ID inválido: ${err.value}`;
      break;

    case 'JsonWebTokenError':
      errorResponse.error.code = 'INVALID_TOKEN';
      errorResponse.error.status = 401;
      errorResponse.error.message = 'Token de autenticação inválido';
      break;

    case 'TokenExpiredError':
      errorResponse.error.code = 'TOKEN_EXPIRED';
      errorResponse.error.status = 401;
      errorResponse.error.message = 'Token de autenticação expirado';
      break;
  }

  // Tratamento para erro de chave duplicada do MongoDB
  if (err.code === 11000) {
    errorResponse.error.code = 'DUPLICATE_KEY';
    errorResponse.error.status = 400;
    errorResponse.error.message = 'Valor duplicado para campo único';
    errorResponse.error.field = Object.keys(err.keyPattern)[0];
  }

  // Log do erro formatado
  console.error('Error Response:', JSON.stringify(errorResponse, null, 2));

  // Enviar resposta
  res.status(errorResponse.error.status).json(errorResponse);
};

module.exports = { notFound, errorHandler };
