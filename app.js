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

// Middlewares de Segurança
app.use(helmet()); // Segurança de cabeçalhos HTTP
app.use(mongoSanitize()); // Previne injeção de NoSQL
app.use(compression()); // Compressão de resposta
app.use(express.json({ limit: '10kb' })); // Limite de tamanho do body
app.use(cors()); // Habilita CORS

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

app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
// Adicione esta configuração para arquivos estáticos ANTES de qualquer middleware de autenticação
// Tornar a pasta uploads pública e acessível
app.use('/api/uploads', express.static('uploads', { public: true }));
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    next();
});

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
app.use("/api", userRoutes);

app.use("/api", companyRoutes);
app.use("/api", provinceRoutes);
app.use("/api", departmentRoutes);
app.use("/api", customerRoutes);
app.use("/api", districtRoutes);
app.use("/api", systemRoutes);
app.use("/api", neighborhoodRoutes);
app.use("/api", connectionRoutes);
app.use("/api", employeeRoutes);
app.use("/api", salaryRoutes);
app.use("/api", taxBenefitRoutes);
app.use("/api", employeeTaxBenefitRoutes);
app.use("/api", expenseRoutes);
app.use("/api", infractionTypeRoutes);
app.use("/api", connectionInfractionRoutes);
app.use("/api", customerInfractionRoutes);
app.use("/api", readingRoutes);
app.use("/api", paymentRoutes);
// app.use("/api", Dashboard)
app.use("/api", dashboardRoutes);
app.use("/api", invoiceRoutes);
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
