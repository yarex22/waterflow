const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const Reading = require('../../../models/waterflow/reading/ReadingModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Connection = require('../../../models/waterflow/connection/ConnectionModel');
const Expense = require('../../../models/waterflow/expenses/ExpenseModel');
const { DashboardRecommendationEngine } = require('./monitoringSystem');
const mongoose = require('mongoose');
const Customer = require('../../../models/waterflow/customer/CustomerModel');

// Main dashboard data method
exports.getDashboardData = asyncHandler(async (req, res, next) => {
    // Log dos parâmetros recebidos
    console.log('Query params:', req.query);
    console.log('Request body:', req.body);
    console.log('User:', { role: req.user.role, company: req.user.company });

    const { month, year } = req.query;
    
    // Se não houver month e year, usar o mês atual
    if (!month || !year) {
        const currentDate = new Date();
        const currentMonth = currentDate.getMonth() + 1; // getMonth() retorna 0-11
        const currentYear = currentDate.getFullYear();
        
        // Usar valores atuais como padrão
        req.query.month = currentMonth;
        req.query.year = currentYear;
    }

    // Converter para números
    const monthNum = parseInt(req.query.month);
    const yearNum = parseInt(req.query.year);

    // Validar range do mês
    if (monthNum < 1 || monthNum > 12) {
        return next(new ErrorResponse('Mês deve estar entre 1 e 12', 400));
    }

    // Validar ano razoável
    const currentYear = new Date().getFullYear();
    if (yearNum < 2000 || yearNum > currentYear + 1) {
        return next(new ErrorResponse('Ano inválido', 400));
    }

    // Get the date range for filtering
    const startDate = new Date(Date.UTC(yearNum, monthNum - 1, 1, 0, 0, 0));
    const endDate = new Date(Date.UTC(yearNum, monthNum, 0, 23, 59, 59));

    // Verificar se as datas são válidas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return next(new ErrorResponse('Erro ao criar intervalo de datas', 400));
    }

    // Definir companyId para filtro baseado no papel do usuário
    let companyId;
    try {
        if (req.user.role === 'admin') {
            companyId = req.query.company || req.query._id || null;
            if (companyId) {
                companyId = new mongoose.Types.ObjectId(companyId);
            }
        } else {
            // Para usuários não-admin, sempre usar a empresa do usuário
            if (!req.user.company) {
                return next(new ErrorResponse('Usuário não possui empresa associada', 400));
            }
            companyId = new mongoose.Types.ObjectId(req.user.company);
        }

        console.log('Using companyId:', companyId);
    } catch (error) {
        console.error('Error converting companyId:', error);
        return next(new ErrorResponse('ID da empresa inválido', 400));
    }

    try {
        // Get all required data concurrently for better performance
        const [
            kpiData,
            consumptionData,
            operationalMetrics,
            financialSummary,
            customerDistribution
        ] = await Promise.all([
            getKPIs(startDate, endDate, companyId),
            getConsumptionByCategory(startDate, endDate, companyId),
            getOperationalMetrics(startDate, endDate, companyId),
            getFinancialSummary(startDate, endDate, companyId),
            getCustomerDistribution(companyId)
        ]);

        // Log para debug
        console.log('Results:', {
            kpiData,
            customerDistribution,
            companyId
        });

        // Calcular total de conexões
        const totalConnections = customerDistribution.reduce((sum, item) => sum + item.count, 0);

        res.status(200).json({
            success: true,
            data: {
                kpis: {
                    ...kpiData,
                    totalConnections
                },
                consumption: consumptionData,
                operational: operationalMetrics,
                financial: financialSummary,
                customerDistribution,
                period: {
                    month: monthNum,
                    year: yearNum,
                    startDate,
                    endDate
                }
            }
        });
    } catch (error) {
        console.error('Error in getDashboardData:', error);
        next(new ErrorResponse(`Error fetching dashboard data: ${error.message}`, 500));
    }
});

// Helper function for KPIs
async function getKPIs(startDate, endDate, companyId) {
    // Log para debug inicial
    console.log('\n=== Debug KPIs ===');
    
    // Primeiro, encontrar todos os customers da company
    const customersOfCompany = await Customer.find({ company: companyId }).select('_id');
    const customerIds = customersOfCompany.map(c => c._id);
    
    // Verificar documentos sem company
    const readingsWithoutCompany = await Reading.countDocuments({ company: { $exists: false } });
    const connectionsWithoutCompany = await Connection.countDocuments({ customer: { $nin: customerIds } });
    const invoicesWithoutCompany = await Invoice.countDocuments({ company: { $exists: false } });
    
    console.log('Documentos sem company:', {
        readingsWithoutCompany,
        connectionsWithoutCompany,
        invoicesWithoutCompany
    });

    // Verificar total de documentos
    const totalReadings = await Reading.countDocuments();
    const totalConnections = await Connection.countDocuments();
    const totalInvoices = await Invoice.countDocuments();
    
    console.log('Total de documentos:', {
        totalReadings,
        totalConnections,
        totalInvoices
    });

    // Verificar documentos para esta empresa específica
    const readingsForCompany = await Reading.countDocuments({ company: companyId });
    const connectionsForCompany = await Connection.countDocuments({ customer: { $in: customerIds } });
    const invoicesForCompany = await Invoice.countDocuments({ company: companyId });
    
    console.log('Documentos para esta empresa:', {
        companyId: companyId,
        readingsForCompany,
        connectionsForCompany,
        invoicesForCompany
    });

    // Exemplo de um documento de cada coleção
    const sampleReading = await Reading.findOne().lean();
    const sampleConnection = await Connection.findOne().lean();
    const sampleInvoice = await Invoice.findOne().lean();
    
    console.log('Exemplo de documentos:', {
        sampleReading: sampleReading ? { 
            _id: sampleReading._id,
            company: sampleReading.company,
        } : null,
        sampleConnection: sampleConnection ? {
            _id: sampleConnection._id,
            customer: sampleConnection.customer,
        } : null,
        sampleInvoice: sampleInvoice ? {
            _id: sampleInvoice._id,
            company: sampleInvoice.company,
        } : null
    });

    // Get total consumption
    const totalConsumption = await Reading.aggregate([
        {
            $match: {
                date: { $gte: startDate, $lte: endDate },
                company: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                totalConsumption: { $sum: '$consumption' }
            }
        }
    ]);

    // Get monthly revenue
    const monthlyRevenue = await Invoice.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate },
                company: companyId ? new mongoose.Types.ObjectId(companyId) : { $exists: true }
            }
        },
        {
            $group: {
                _id: null,
                totalRevenue: { $sum: '$totalAmount' }
            }
        }
    ]);

    // Get total unique clients (connections)
    const totalClients = await Connection.aggregate([
        {
            $match: {
                customer: { $in: customerIds }
            }
        },
        {
            $group: {
                _id: '$customer'
            }
        },
        {
            $count: 'total'
        }
    ]).then(result => result[0]?.total || 0);

    // Calculate collection rate
    const collectionRate = await calculateCollectionRate(startDate, endDate, companyId);

    console.log('=== Fim Debug KPIs ===\n');

    return {
        totalConsumption: totalConsumption[0]?.totalConsumption || 0,
        monthlyRevenue: monthlyRevenue[0]?.totalRevenue || 0,
        totalClients,
        collectionRate
    };
}

// Helper function for consumption by category
async function getConsumptionByCategory(startDate, endDate, companyId) {
    const match = { date: { $gte: startDate, $lte: endDate } };
    if (companyId) match.company = new mongoose.Types.ObjectId(companyId);
    return await Reading.aggregate([
        { $match: match },
        {
            $lookup: {
                from: 'connections',
                localField: 'connectionId',
                foreignField: '_id',
                as: 'connectionData'
            }
        },
        {
            $unwind: '$connectionData'
        },
        {
            $group: {
                _id: {
                    month: { $month: '$date' },
                    category: '$connectionData.category'
                },
                consumption: { $sum: '$consumption' },
                averageConsumption: { $avg: '$consumption' },
                numberOfReadings: { $sum: 1 }
            }
        },
        {
            $sort: {
                '_id.month': 1
            }
        }
    ]);
}

// Helper function for operational metrics
async function getOperationalMetrics(startDate, endDate, companyId) {
    // Novas conexões com detalhes por categoria
    const newConnectionsByCategory = await Connection.aggregate([
        {
            $match: {
                createdAt: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 }
            }
        }
    ]);

    // Desconexões com motivos
    const disconnectionDetails = await Connection.aggregate([
        {
            $match: {
                status: { $in: ['Inactivo', 'Fraude'] },  // Incluir ambos os estados
                lastDisconnectionDate: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$status',  // Agrupar pelo status ao invés de disconnectionReason
                count: { $sum: 1 }
            }
        }
    ]);

    // Taxa de inadimplência por categoria
    const delinquencyByCategory = await Invoice.aggregate([
        {
            $match: {
                dueDate: { $lt: endDate },
                status: { $in: ['não pago', 'pago parcial'] }
            }
        },
        {
            $lookup: {
                from: 'connections',
                localField: 'connection',
                foreignField: '_id',
                as: 'connectionData'
            }
        },
        {
            $unwind: '$connectionData'
        },
        {
            $group: {
                _id: '$connectionData.category',
                delinquentCount: { $sum: 1 },
                totalAmount: { $sum: '$totalAmount' }
            }
        }
    ]);

    // Consumo e estatísticas básicas
    const consumptionStats = await Reading.aggregate([
        {
            $match: {
                date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: null,
                average: { $avg: '$consumption' },
                min: { $min: '$consumption' },
                max: { $max: '$consumption' },
                totalReadings: { $sum: 1 },
                standardDeviation: { $stdDevPop: '$consumption' }
            }
        }
    ]);

    // Eficiência de leitura por categoria
    const efficiency = await Reading.aggregate([
        {
            $match: {
                date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $lookup: {
                from: 'connections',
                localField: 'connectionId',
                foreignField: '_id',
                as: 'connection'
            }
        },
        {
            $unwind: '$connection'
        },
        {
            $group: {
                _id: '$connection.category',
                readingEfficiency: {
                    $avg: {
                        $cond: [
                            { $eq: ['$consumption', 0] },
                            0,
                            1
                        ]
                    }
                },
                zeroReadings: {
                    $sum: {
                        $cond: [
                            { $eq: ['$consumption', 0] },
                            1,
                            0
                        ]
                    }
                },
                totalReadings: { $sum: 1 },
                avgConsumption: { $avg: '$consumption' },
                stdDev: { $stdDevPop: '$consumption' }
            }
        }
    ]);

    // Análise de padrões anômalos por conexão
    const anomalousPatterns = await Reading.aggregate([
        {
            $match: {
                date: { $gte: startDate, $lte: endDate }
            }
        },
        {
            $group: {
                _id: '$connectionId._id',
                readings: { $push: '$consumption' },
                avgConsumption: { $avg: '$consumption' },
                stdDev: { $stdDevPop: '$consumption' },
                count: { $sum: 1 },
                zeroCount: {
                    $sum: {
                        $cond: [
                            { $eq: ['$consumption', 0] },
                            1,
                            0
                        ]
                    }
                },
                highCount: {
                    $sum: {
                        $cond: [
                            { $gt: ['$consumption', { $multiply: [{ $avg: '$consumption' }, 3] }] },
                            1,
                            0
                        ]
                    }
                }
            }
        },
        {
            $lookup: {
                from: 'connections',
                localField: '_id',
                foreignField: '_id',
                as: 'connectionData'
            }
        },
        {
            $unwind: '$connectionData'
        },
        {
            $project: {
                category: '$connectionData.category',
                meterNumber: '$connectionData.meterNumber',
                avgConsumption: 1,
                stdDev: 1,
                zeroCount: 1,
                highCount: 1,
                variationCoefficient: {
                    $cond: [
                        { $eq: ['$avgConsumption', 0] },
                        0,
                        { $divide: ['$stdDev', '$avgConsumption'] }
                    ]
                }
            }
        }
    ]);

    // Calcular alertas
    const stats = consumptionStats[0] || { average: 0, standardDeviation: 0, min: 0, max: 0 };
    const alerts = {
        highVariation: stats.standardDeviation > stats.average,
        zeroConsumption: stats.min === 0,
        unusuallyHighConsumption: stats.max > (stats.average * 3),
        anomalousConnections: anomalousPatterns.filter(p => 
            p.variationCoefficient > 0.5 || 
            p.zeroCount > 0 || 
            p.highCount > 0
        )
    };

    return {
        connections: {
            new: {
                total: newConnectionsByCategory.reduce((sum, cat) => sum + cat.count, 0),
                byCategory: newConnectionsByCategory
            },
            disconnected: {
                total: disconnectionDetails.reduce((sum, d) => sum + d.count, 0),
                byReason: disconnectionDetails
            }
        },
        delinquency: {
            rate: await calculateDelinquencyRate(startDate, endDate, companyId),
            byCategory: delinquencyByCategory
        },
        consumption: {
            average: stats.average,
            min: stats.min,
            max: stats.max,
            totalReadings: stats.totalReadings,
            standardDeviation: stats.standardDeviation
        },
        efficiency,
        anomalies: {
            connections: anomalousPatterns.map(p => ({
                category: p.category,
                meterNumber: p.meterNumber,
                avgConsumption: Math.round(p.avgConsumption * 100) / 100,
                variationCoefficient: Math.round(p.variationCoefficient * 100) / 100,
                zeroReadings: p.zeroCount,
                highReadings: p.highCount
            }))
        },
        alerts
    };
}

// Helper function for financial summary
async function getFinancialSummary(startDate, endDate, companyId) {
    // Buscar receita total das faturas
    const revenueMatch = { createdAt: { $gte: startDate, $lte: endDate } };
    if (companyId) revenueMatch.company = new mongoose.Types.ObjectId(companyId);
    const revenue = await Invoice.aggregate([
        { $match: revenueMatch },
        { $group: { _id: null, totalRevenue: { $sum: '$totalAmount' } } }
    ]);

    // Buscar despesas - Simplificando a query para debug
    const expenseMatch = { date: { $gte: startDate, $lte: endDate } };
    if (companyId) expenseMatch.company = new mongoose.Types.ObjectId(companyId);
    
    const expenses = await Expense.aggregate([
        {
            $match: expenseMatch
        },
        {
            $group: {
                _id: '$category',
                totalAmount: { $sum: '$amount' },
                count: { $sum: 1 },
                averageAmount: { $avg: '$amount' },
                minAmount: { $min: '$amount' },
                maxAmount: { $max: '$amount' }
            }
        },
        {
            $sort: { 
                totalAmount: -1
            }
        }
    ]);

    // Log para debug
    console.log('Debug Financeiro:', {
        startDate,
        endDate,
        companyId,
        revenueFound: revenue.length > 0,
        expensesFound: expenses.length > 0,
        totalExpenses: expenses.length,
        expenseCategories: expenses.map(e => e._id)
    });

    // Calcular totais
    const totalRevenue = revenue[0]?.totalRevenue || 0;
    const totalExpenses = expenses.reduce((sum, exp) => sum + exp.totalAmount, 0);
    const netProfit = totalRevenue - totalExpenses;

    // Organizar despesas por categoria
    const expensesByCategory = expenses.map(exp => ({
        category: exp._id,
        amount: Math.round(exp.totalAmount * 100) / 100,
        count: exp.count,
        average: Math.round(exp.averageAmount * 100) / 100,
        min: Math.round(exp.minAmount * 100) / 100,
        max: Math.round(exp.maxAmount * 100) / 100,
        percentageOfTotal: totalExpenses ? Math.round((exp.totalAmount / totalExpenses) * 100 * 100) / 100 : 0
    }));

    return {
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalExpenses: Math.round(totalExpenses * 100) / 100,
        netProfit: Math.round(netProfit * 100) / 100,
        expensesByCategory,
        summary: {
            revenueToExpenseRatio: totalExpenses ? Math.round((totalRevenue / totalExpenses) * 100) / 100 : 0,
            profitMargin: totalRevenue ? Math.round((netProfit / totalRevenue) * 100 * 100) / 100 : 0,
            topExpenseCategories: expensesByCategory
                .slice(0, 3)
                .map(exp => ({
                    category: exp.category,
                    amount: exp.amount,
                    percentage: exp.percentageOfTotal
                }))
        }
    };
}

// Helper function for customer distribution
async function getCustomerDistribution(companyId) {
    // Log para debug
    console.log('\n=== Debug Customer Distribution ===');
    
    // Primeiro, encontrar todos os customers da company
    const customersOfCompany = await Customer.find({ company: companyId }).select('_id');
    const customerIds = customersOfCompany.map(c => c._id);
    
    // Contar total de conexões
    const totalConnections = await Connection.countDocuments();
    console.log('Total de conexões:', totalConnections);
    
    // Contar conexões sem customer da company
    const connectionsWithoutCompany = await Connection.countDocuments({ 
        customer: { $nin: customerIds }
    });
    console.log('Conexões sem company:', connectionsWithoutCompany);
    
    // Verificar documentos sem company
    const readingsWithoutCompany = await Reading.countDocuments({ company: { $exists: false } });
    const invoicesWithoutCompany = await Invoice.countDocuments({ company: { $exists: false } });
    
    console.log('Documentos sem company:', {
        readingsWithoutCompany,
        connectionsWithoutCompany,
        invoicesWithoutCompany
    });
    
    // Contar conexões para esta company
    const connectionsForCompany = await Connection.countDocuments({ 
        customer: { $in: customerIds }
    });
    console.log('Conexões para esta empresa:', {
        companyId,
        count: connectionsForCompany
    });
    
    // Exemplo de uma conexão
    const sampleConnection = await Connection.findOne().lean();
    console.log('Exemplo de conexão:', {
        _id: sampleConnection?._id,
        customer: sampleConnection?.customer,
        category: sampleConnection?.category
    });

    // Fazer a agregação por categoria
    const result = await Connection.aggregate([
        {
            $match: {
                customer: { $in: customerIds }
            }
        },
        {
            $group: {
                _id: '$category',
                count: { $sum: 1 }
            }
        }
    ]);
    
    console.log('Resultado da agregação:', result);
    console.log('=== Fim Debug Customer Distribution ===\n');
    
    return result;
}

// Helper function to calculate collection rate
async function calculateCollectionRate(startDate, endDate, companyId) {
    const match = { createdAt: { $gte: startDate, $lte: endDate } };
    if (companyId) match.company = new mongoose.Types.ObjectId(companyId);
    const invoiceData = await Invoice.aggregate([
        { $match: match },
        { $group: { _id: null, totalBilled: { $sum: '$totalAmount' }, totalCollected: { $sum: { $cond: [ { $eq: ['$status', 'pago'] }, '$totalAmount', 0 ] } } } }
    ]);
    if (!invoiceData[0]) return 0;
    return (invoiceData[0].totalCollected / invoiceData[0].totalBilled) * 100;
}

// Helper function to calculate delinquency rate
async function calculateDelinquencyRate(startDate, endDate, companyId) {
    const match = { dueDate: { $lt: endDate }, status: { $in: ['não pago', 'pago parcial'] } };
    if (companyId) match.company = new mongoose.Types.ObjectId(companyId);
    const invoiceData = await Invoice.aggregate([
        { $match: match },
        { $group: { _id: null, totalDelinquent: { $sum: 1 }, totalInvoices: { $sum: 1 } } }
    ]);
    if (!invoiceData[0]) return 0;
    return (invoiceData[0].totalDelinquent / invoiceData[0].totalInvoices) * 100;
}

// Separate endpoint for consumption graph with more filtering options
exports.getConsumptionGraph = asyncHandler(async (req, res, next) => {
    let { startDate, endDate, category, period = 'monthly' } = req.query;
    
    // Se não houver datas, usar o mês atual
    if (!startDate || !endDate) {
        const today = new Date();
        const firstDayOfMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1, 0, 0, 0));
        const lastDayOfMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59));
        
        startDate = firstDayOfMonth.toISOString();
        endDate = lastDayOfMonth.toISOString();
    }

    // Validar e converter as datas
    const parsedStartDate = new Date(startDate);
    const parsedEndDate = new Date(endDate);

    // Verificar se as datas são válidas
    if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
        return next(new ErrorResponse('Datas inválidas', 400));
    }

    const pipeline = [
        // Primeiro match para filtrar por data
        {
            $match: {
                date: {
                    $gte: parsedStartDate,
                    $lte: parsedEndDate
                }
            }
        },
        // Agrupar os dados
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" },
                    connectionId: "$connectionId._id"
                },
                consumption: { $sum: "$consumption" },
                numberOfReadings: { $sum: 1 },
                averageConsumption: { $avg: "$consumption" },
                // Mantém uma cópia do connectionId para o lookup
                connectionId: { $first: "$connectionId._id" }
            }
        },
        // Lookup para pegar os dados da conexão
        {
            $lookup: {
                from: "connections",
                localField: "connectionId",
                foreignField: "_id",
                as: "connectionData"
            }
        },
        // Unwind do array de connectionData
        {
            $unwind: "$connectionData"
        },
        // Reagrupar por categoria
        {
            $group: {
                _id: {
                    year: "$_id.year",
                    month: "$_id.month",
                    category: "$connectionData.category"
                },
                consumption: { $sum: "$consumption" },
                numberOfReadings: { $sum: "$numberOfReadings" },
                averageConsumption: { $avg: "$averageConsumption" }
            }
        },
        // Ordenar os resultados
        {
            $sort: {
                "_id.year": 1,
                "_id.month": 1,
                "_id.category": 1
            }
        }
    ];

    // Se houver categoria específica, adiciona filtro
    if (category) {
        pipeline.push({
            $match: {
                "_id.category": category
            }
        });
    }

    // Executar a agregação
    const consumptionData = await Reading.aggregate(pipeline);

    // Log para debug
    console.log('Dados encontrados:', consumptionData);

    // Se não houver dados, retornar informações de debug
    if (consumptionData.length === 0) {
        const totalReadings = await Reading.countDocuments({
            date: { $gte: parsedStartDate, $lte: parsedEndDate }
        });
        const totalConnections = await Connection.countDocuments();

        return res.status(200).json({
            success: true,
            data: [],
            debug: {
                queryUsed: {
                    date: {
                        $gte: parsedStartDate,
                        $lte: parsedEndDate
                    }
                },
                periodStart: parsedStartDate,
                periodEnd: parsedEndDate,
                totalReadingsInPeriod: totalReadings,
                totalConnectionsInSystem: totalConnections,
                categoryFilter: category || 'none'
            }
        });
    }

    // Retornar os dados encontrados
    res.status(200).json({
        success: true,
        data: consumptionData,
        period: {
            startDate: parsedStartDate,
            endDate: parsedEndDate,
            category: category || 'all'
        }
    });
});

const calculateRiskScore = (connection) => {
    let score = 0;
    
    // Penalidades por leituras zero
    score += connection.zeroReadings * 20;
    
    // Penalidade por variação (>0.5 é considerado alto)
    if (connection.variationCoefficient > 1.0) score += 30;
    else if (connection.variationCoefficient > 0.5) score += 15;
    
    // Penalidade por consumo muito diferente da média da categoria
    const categoryAverages = {
        "Municipio": 7.64,
        "Comercial": 5.8,
        "Domestico": 5.5,
        "Industrial": 2.0
    };
    
    const avgDiff = Math.abs(connection.avgConsumption - categoryAverages[connection.category]);
    if (avgDiff > categoryAverages[connection.category]) score += 20;
    
    return Math.min(100, score);
};

const riskScoring = {
    calculateRisk: (efficiency, zeroReadings, variation) => {
        let score = 100;
        
        // Reduz pontuação baseado na eficiência
        score -= (1 - efficiency) * 30;
        
        // Reduz pontuação por leituras zero
        score -= zeroReadings * 10;
        
        // Reduz pontuação por alta variação
        if (variation > 1.5) score -= 20;
        
        return Math.max(0, score);
    }
};

const priorityInspections = [
    {
        meterNumber: "MED2345iii",
        category: "Municipio",
        reason: "2 leituras zero + alta variação",
        priority: "ALTA"
    },
    {
        meterNumber: "MED2345trrr",
        category: "Comercial",
        reason: "1 leitura zero + maior variação",
        priority: "ALTA"
    },
    {
        meterNumber: "MED2345tr",
        category: "Municipio",
        reason: "Consumo muito acima da média",
        priority: "MÉDIA"
    }
];

const monitoringImprovements = {
    daily: {
        zeroReadings: true,
        variationThreshold: 0.5,
        automaticAlerts: true
    },
    weekly: {
        efficiencyReport: true,
        anomalyTrends: true
    },
    monthly: {
        categoryBenchmark: true,
        performanceMetrics: true
    }
};

const categoryAnalysis = {
    "Municipio": {
        totalConsumption: 84,
        connections: 3,
        problems: {
            zeroReadings: 2,
            highVariation: 2,
            abnormalConsumption: 1
        },
        riskLevel: "ALTO"
    },
    "Comercial": {
        totalConsumption: 29,
        connections: 3,
        problems: {
            zeroReadings: 1,
            highVariation: 1,
            abnormalConsumption: 0
        },
        riskLevel: "MÉDIO"
    },
    "Domestico": {
        totalConsumption: 11,
        connections: 3,
        problems: {
            zeroReadings: 0,
            highVariation: 0,
            abnormalConsumption: 0
        },
        riskLevel: "BAIXO"
    },
    "Industrial": {
        totalConsumption: 4,
        connections: 1,
        problems: {
            zeroReadings: 0,
            highVariation: 0,
            abnormalConsumption: 0
        },
        riskLevel: "BAIXO"
    }
};

// Keep the example usage function but make it an export if you want to use it
exports.generateDashboardRecommendations = asyncHandler(async (req, res) => {
    try {
        const utilityData = {
            revenue: 7844,
            expenses: 22990,
            outrosExpenses: 15173.4,
            collectionRate: 0.2142,
            meters: [
                {
                    meterId: 'MED2345iii',
                    readings: [0, 0, 15, 0],
                    variationCoefficient: 0.8
                }
            ]
        };

        const recommendationEngine = new DashboardRecommendationEngine();
        const recommendations = recommendationEngine.generateRecommendations(utilityData);
        
        res.json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Keep the getDashboardRecommendations endpoint
exports.getDashboardRecommendations = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
        return next(new ErrorResponse('Start date and end date are required', 400));
    }

    try {
        // Get all required data
        const [financialData, meterData] = await Promise.all([
            getFinancialSummary(new Date(startDate), new Date(endDate)),
            getOperationalMetrics(new Date(startDate), new Date(endDate))
        ]);

        // Prepare utility data for the recommendation engine
        const utilityData = {
            revenue: financialData.totalRevenue,
            expenses: financialData.totalExpenses,
            outrosExpenses: financialData.expensesByCategory.find(e => e.category === 'outros')?.amount || 0,
            collectionRate: await calculateCollectionRate(new Date(startDate), new Date(endDate)),
            meters: meterData.anomalies.connections.map(conn => ({
                meterId: conn.meterNumber,
                readings: conn.readings || [],
                variationCoefficient: conn.variationCoefficient
            }))
        };

        // Generate recommendations
        const recommendationEngine = new DashboardRecommendationEngine();
        const recommendations = recommendationEngine.generateRecommendations(utilityData);

        res.status(200).json({
            success: true,
            data: recommendations
        });
    } catch (error) {
        next(new ErrorResponse(`Error generating recommendations: ${error.message}`, 500));
    }
});