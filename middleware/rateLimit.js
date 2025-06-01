const ErrorResponse = require('../utils/ErrorResponse');
const logger = require('../utils/logger');

const ERROR_MESSAGES = {
    RATE_LIMIT: 'Muitas requisições, por favor tente novamente mais tarde.'
};

// Middleware para lidar com erros de rate limit
const handleRateLimit = (err, req, res, next) => {
    if (err.message && err.message.toLowerCase().includes('too many requests')) {
        logger.logError('Rate limit exceeded', {
            userRole: req.user?.role,
            userId: req.user?.id,
            path: req.path,
            method: req.method,
            ip: req.ip,
            headers: req.headers
        });
        
        return next(new ErrorResponse(ERROR_MESSAGES.RATE_LIMIT, 429));
    }
    next(err);
};

module.exports = handleRateLimit; 