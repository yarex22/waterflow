const ErrorResponse = require('../utils/ErrorResponse');

const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
        console.log(err);
    }

    // Erro de token inválido ou expirado
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        const message = 'Não autorizado: Sessão inválida ou expirada';
        error = new ErrorResponse(message, 401);
    }

    // Erro de ID do Mongoose inválido
    if (err.name === 'CastError') {
        const message = 'Recurso não encontrado';
        error = new ErrorResponse(message, 404);
    }

    // Erro de campo duplicado
    if (err.code === 11000) {
        const message = 'Valor duplicado inserido';
        error = new ErrorResponse(message, 400);
    }

    // Erros de validação do Mongoose
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message);
        error = new ErrorResponse(message, 400);
    }

    res.status(error.statusCode || 500).json({
        success: false,
        error: {
            message: error.message || 'Erro no servidor',
            code: error.statusCode || 500,
            ...(process.env.NODE_ENV === 'development' && {
                stack: err.stack,
                details: err
            })
        }
    });
};

module.exports = errorHandler; 