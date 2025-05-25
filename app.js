const express = require("express");
const mongoose = require("mongoose");
const morgan = require("morgan");
const bodyParser = require("body-parser");
require("dotenv").config();
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { errorHandler, notFound } = require("./middleware/error");
const websocketHandler = require("./middleware/websocketHandler");
const http = require("http");
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const logger = require('./utils/logger');
const path = require('path');
const { checkReportOnlyAccess } = require("./middleware/auth");

// Import socket.io and initialize it with the http server
const socketIo = require("socket.io");

const app = express();

// Configuração do Swagger
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'API Waterflow',
            version: '1.0.0',
            description: 'Documentação da API Waterflow'
        },
        servers: [
            {
                url: `http://localhost:${process.env.PORT || 5000}`,
                description: 'Servidor de Desenvolvimento'
            }
        ]
    },
    apis: ['./routes/*.js', './routes/**/*.js'] // Adicionando suporte para subpastas
};

// Gerar documentação Swagger
const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Body parser configuration
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Security Middlewares
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: { policy: "same-origin" }
}));
app.use(mongoSanitize());
app.use(compression());

// Comprehensive CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = [
            'http://localhost:8080',
            'http://172.30.208.1:8080',
            'https://waterflow-jafo.onrender.com',
            'http://localhost:5173', // Vite default port
            undefined // Allow requests with no origin (like mobile apps or curl requests)
        ];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'token',
        'Accept',
        'Origin',
        'X-Requested-With',
        'Access-Control-Allow-Headers',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers'
    ],
    exposedHeaders: ['token', 'Authorization'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400 // Preflight results cache for 24 hours
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100 // limite por IP
});
app.use('/api', limiter);

// Logging
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

// Configuração da documentação Swagger
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Adicione esta configuração para arquivos estáticos ANTES de qualquer middleware de autenticação
// Tornar a pasta uploads pública e acessível
app.use('/api/uploads', express.static('uploads', { public: true }));

// Servir arquivos estáticos da pasta uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Rotas de upload
app.use('/api', require('./routes/uploadRoutes'));

mongoose.set("strictQuery", false);

mongoose
  .connect(process.env.DATABASE, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("DB connected");
  })
  .catch((error) => {
    if (error.code === "ETIMEOUT" && error.syscall === "querySrv") {
      console.error("MongoDB connection timed out. Please try again later.");
    } else {
      console.error("MongoDB connection error:", error);
    }
  });

// const sseRoutes = require("./routes/sseRoutes").router;
// app.use("/api", sseRoutes);

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

// const Dashboard = require("./routes/dashboard/dashboardRoutes");

const companyRoutes = require("./routes/waterflow/companyRoutes");
const provinceRoutes = require("./routes/waterflow/pronvinceRoutes");
const departmentRoutes = require("./routes/waterflow/departmentRoutes");
const customerRoutes = require("./routes/waterflow/customerRoutes");
const districtRoutes = require("./routes/waterflow/districtRoutes");
const systemRoutes = require("./routes/waterflow/system/systemRoutes");
const neighborhoodRoutes = require("./routes/waterflow/neighborhoodRoutes");
const connectionRoutes = require("./routes/waterflow/connectionRoutes");
const employeeRoutes = require("./routes/waterflow/employeeRoutes");
const salaryRoutes = require("./routes/waterflow/salaryRoutes");
const taxBenefitRoutes = require("./routes/waterflow/taxBenefitRoutes");
const employeeTaxBenefitRoutes = require("./routes/waterflow/employeeTaxBenefitRoutes");
const expenseRoutes = require("./routes/waterflow/expenseRoutes");
const infractionTypeRoutes = require("./routes/waterflow/infractionTypeRoutes");
const connectionInfractionRoutes = require("./routes/waterflow/connectionInfractionRoutes");
const customerInfractionRoutes = require("./routes/waterflow/customerInfractionRoutes");
const readingRoutes = require("./routes/waterflow/readingRoutes");
const paymentRoutes = require("./routes/waterflow/paymentRoutes");
const reportRoutes = require("./routes/waterflow/reportRoutes");
const dashboardRoutes = require("./routes/waterflow/dashboardRoutes");

// Importar rotas
const invoiceRoutes = require('./routes/waterflow/invoiceRoutes');

// Definição das rotas da API com autenticação
app.use("/api", authRoutes);

// Rotas que requerem autenticação
const { isAuthenticated } = require("./middleware/auth");
app.use("/api", isAuthenticated, userRoutes);
app.use("/api", isAuthenticated, companyRoutes);
app.use("/api", isAuthenticated, provinceRoutes);
app.use("/api", isAuthenticated, departmentRoutes);
app.use("/api", isAuthenticated, customerRoutes);
app.use("/api", isAuthenticated, districtRoutes);
app.use("/api", isAuthenticated, systemRoutes);
app.use("/api", isAuthenticated, neighborhoodRoutes);
app.use("/api", isAuthenticated, connectionRoutes);
app.use("/api", isAuthenticated, employeeRoutes);
app.use("/api", isAuthenticated, salaryRoutes);
app.use("/api", isAuthenticated, taxBenefitRoutes);
app.use("/api", isAuthenticated, employeeTaxBenefitRoutes);
app.use("/api", isAuthenticated, expenseRoutes);
app.use("/api", isAuthenticated, infractionTypeRoutes);
app.use("/api", isAuthenticated, connectionInfractionRoutes);
app.use("/api", isAuthenticated, customerInfractionRoutes);
app.use("/api", isAuthenticated, readingRoutes);
app.use("/api", isAuthenticated, paymentRoutes);
app.use("/api", isAuthenticated, dashboardRoutes);
app.use("/api", isAuthenticated, invoiceRoutes);
app.use((req, res, next) => {
  console.log("Received headers:", req.headers);
  next();
});

const server = http.createServer(app);

// Initialize socket.io with the server
const io = socketIo(server);

// Connect the websocketHandler
websocketHandler(io);

app.locals.io = io; // Store io instance for later use in your application

const port = process.env.PORT || 8000;

// Usar apenas esta configuração do servidor
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    logger.info(`Servidor rodando na porta ${PORT} em modo ${process.env.NODE_ENV}`);
});

// Adicionar middleware de log para todas as requisições
app.use(logger.logRequest);

// Atualizar o middleware de erro global
const errorHandlerGlobal = (err, req, res, next) => {
    logger.logError(err, req);

    res.status(err.statusCode || 500).json({
        success: false,
        error: err.message || 'Erro no servidor'
    });
};

// Handler para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint não encontrado'
    });
});

// Middleware de erro
app.use(errorHandlerGlobal);

// Verificar variáveis de ambiente necessárias
const checkEnv = () => {
    const required = ['DATABASE', 'JWT_SECRET', 'NODE_ENV'];
    required.forEach(item => {
        if (!process.env[item]) {
            logger.error(`Variável de ambiente ${item} não definida`);
            process.exit(1);
        }
    });
};

// Tratamento de erros não capturados
process.on('unhandledRejection', (err) => {
    logger.error('Erro não tratado: ' + err.message);
    process.exit(1);
});

process.on('SIGTERM', () => {
    console.log('👋 SIGTERM RECEIVED. Shutting down gracefully');
    server.close(() => {
        console.log('💥 Process terminated!');
    });
});
// Aplicar middleware de verificação de acesso após a autenticação
app.use(checkReportOnlyAccess);

