const winston = require('winston');
const path = require('path');

// Definindo os níveis de log personalizados
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Definindo cores diferentes para cada nível de log
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Adicionando cores ao winston
winston.addColors(colors);

// Formato personalizado para os logs
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}${info.stack ? '\n' + info.stack : ''}`
  )
);

// Formato personalizado para console
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Criando o logger
const logger = winston.createLogger({
  levels,
  format,
  transports: [
    // Arquivo para todos os logs
    new winston.transports.File({
      filename: path.join('logs', 'combined.log'),
      level: 'debug',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Arquivo separado para erros
    new winston.transports.File({
      filename: path.join('logs', 'error.log'),
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Arquivo separado para logs de negócio
    new winston.transports.File({
      filename: path.join('logs', 'business.log'),
      level: 'info',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  ],
});

// Adicionar logs no console se não estiver em produção
if (process.env.NODE_ENV !== 'production') {
  logger.add(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug',
    })
  );
}

// Middleware para log de requisições HTTP
logger.logRequest = (req, res, next) => {
  logger.http({
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  next();
};

// Função auxiliar para log de erros
// Middleware para log de requisições HTTP
logger.logRequest = (req, res, next) => {
  logger.http({
    method: req.method,
    path: req.originalUrl,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  next();
};

logger.logError = (err, req) => {
  logger.error({
    message: err.message,
    stack: err.stack,
    path: req?.originalUrl,
    method: req?.method,
    body: req?.body,
    user: req?.user?._id,
    timestamp: new Date().toISOString()
  });
};

// Função auxiliar para log de operações de negócio
logger.logBusiness = (operation, details) => {
  logger.info({
    operation,
    details,
    timestamp: new Date().toISOString()
  });
};

module.exports = logger;