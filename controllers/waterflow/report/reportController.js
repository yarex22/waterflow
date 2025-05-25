

const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const Reading = require('../../../models/waterflow/reading/ReadingModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Payment = require('../../../models/waterflow/payment/PaymentModel');
const Customer = require('../../../models/waterflow/customer/CustomerModel');
const Connection = require('../../../models/waterflow/connection/ConnectionModel');
const Notification = require('../../../models/waterflow/notification/NotificationModel');
const User = require('../../../models/userModel');
const AuditLog = require('../../../models/auditLogModel');
const SystemStats = require('../../../models/waterflow/report/systemStatsModel');
const Expense = require('../../../models/waterflow/expenses/ExpenseModel');
const Salary = require('../../../models/waterflow/salary/SalaryModel');
const mongoose = require('mongoose');

// Relatório de Consumo por Cliente
exports.getCustomerConsumptionReport = asyncHandler(async (req, res, next) => {
    const { customerId, startDate, endDate } = req.query;

    if (!customerId) {
        return next(new ErrorResponse('ID do cliente é obrigatório', 400));
    }

    const readings = await Reading.find({
        customerId,
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    }).sort({ date: 1 });

    const consumptionData = {
        totalConsumption: 0,
        averageConsumption: 0,
        monthlyConsumption: {},
        abnormalReadings: []
    };

    readings.forEach(reading => {
        const month = reading.date.toISOString().slice(0, 7);
        consumptionData.totalConsumption += reading.consumption;
        
        if (!consumptionData.monthlyConsumption[month]) {
            consumptionData.monthlyConsumption[month] = 0;
        }
        consumptionData.monthlyConsumption[month] += reading.consumption;

        if (reading.consumption > reading.averageConsumption * 2) {
            consumptionData.abnormalReadings.push({
                date: reading.date,
                consumption: reading.consumption,
                average: reading.averageConsumption
            });
        }
    });

    consumptionData.averageConsumption = readings.length > 0 
        ? consumptionData.totalConsumption / readings.length 
        : 0;

    res.status(200).json({
        success: true,
        data: consumptionData
    });
});

// Relatório Financeiro
exports.getFinancialReport = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, category } = req.query;

    const query = {
        dateIssued: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    if (category) {
        query['connection.category'] = category;
    }

    const invoices = await Invoice.find(query)
        .populate('customer')
        .populate('connection');

    const financialData = {
        totalRevenue: 0,
        totalPaid: 0,
        totalPending: 0,
        invoicesByStatus: {
            pago: 0,
            'pago parcial': 0,
            'não pago': 0,
            vencido: 0
        },
        revenueByCategory: {}
    };

    invoices.forEach(invoice => {
        financialData.totalRevenue += invoice.totalAmount;
        financialData.totalPaid += invoice.totalAmount - invoice.remainingDebt;
        financialData.totalPending += invoice.remainingDebt;
        financialData.invoicesByStatus[invoice.status]++;

        const category = invoice.connection.category;
        if (!financialData.revenueByCategory[category]) {
            financialData.revenueByCategory[category] = 0;
        }
        financialData.revenueByCategory[category] += invoice.totalAmount;
    });

    res.status(200).json({
        success: true,
        data: financialData
    });
});

// Relatório de Inadimplência
exports.getDefaultersReport = asyncHandler(async (req, res, next) => {
    const { minDaysOverdue = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - minDaysOverdue);

    const overdueInvoices = await Invoice.find({
        status: { $in: ['não pago', 'pago parcial'] },
        dueDate: { $lt: cutoffDate }
    })
    .populate('customer')
    .populate('connection');

    const defaultersData = {
        totalOverdueAmount: 0,
        totalDefaulters: 0,
        defaultersByCategory: {},
        defaultersList: []
    };

    const customerDebts = {};

    overdueInvoices.forEach(invoice => {
        const customerId = invoice.customer._id.toString();
        
        if (!customerDebts[customerId]) {
            customerDebts[customerId] = {
                customerId: customerId,
                customerName: invoice.customer.name,
                totalDebt: 0,
                invoicesCount: 0,
                oldestDebt: null,
                category: invoice.connection.category
            };
        }

        customerDebts[customerId].totalDebt += invoice.remainingDebt;
        customerDebts[customerId].invoicesCount++;
        
        if (!customerDebts[customerId].oldestDebt || 
            invoice.dueDate < customerDebts[customerId].oldestDebt) {
            customerDebts[customerId].oldestDebt = invoice.dueDate;
        }
    });

    defaultersData.defaultersList = Object.values(customerDebts)
        .sort((a, b) => b.totalDebt - a.totalDebt);

    defaultersData.totalDefaulters = defaultersData.defaultersList.length;
    defaultersData.totalOverdueAmount = defaultersData.defaultersList
        .reduce((sum, defaulter) => sum + defaulter.totalDebt, 0);

    res.status(200).json({
        success: true,
        data: defaultersData
    });
});

// Relatório Operacional de Leituras
exports.getReadingsReport = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, region } = req.query;

    const query = {
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    };

    if (region) {
        query['connection.region'] = region;
    }

    const readings = await Reading.find(query)
        .populate('connection')
        .populate('createdBy', 'name');

    const readingsData = {
        totalReadings: readings.length,
        readingsByRegion: {},
        readingsByReader: {},
        averageConsumption: 0,
        abnormalReadingsCount: 0
    };

    let totalConsumption = 0;

    readings.forEach(reading => {
        // Agrupamento por região
        const region = reading.connection.region;
        if (!readingsData.readingsByRegion[region]) {
            readingsData.readingsByRegion[region] = {
                count: 0,
                totalConsumption: 0
            };
        }
        readingsData.readingsByRegion[region].count++;
        readingsData.readingsByRegion[region].totalConsumption += reading.consumption;

        // Agrupamento por leitor
        const reader = reading.createdBy.name;
        if (!readingsData.readingsByReader[reader]) {
            readingsData.readingsByReader[reader] = {
                count: 0,
                totalReadings: 0
            };
        }
        readingsData.readingsByReader[reader].count++;

        totalConsumption += reading.consumption;

        // Contagem de leituras anormais
        if (reading.consumption > reading.averageConsumption * 2) {
            readingsData.abnormalReadingsCount++;
        }
    });

    readingsData.averageConsumption = readings.length > 0 
        ? totalConsumption / readings.length 
        : 0;

    res.status(200).json({
        success: true,
        data: readingsData
    });
});

// Relatório de Eficiência do Sistema
exports.getSystemEfficiencyReport = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    const systemData = {
        totalConnections: await Connection.countDocuments({ active: true }),
        readingEfficiency: 0,
        paymentEfficiency: 0,
        averageResponseTime: 0,
        systemAvailability: 100, // Pode ser calculado com base em logs de downtime
        errorRate: 0
    };

    // Cálculo de eficiência de leituras
    const totalExpectedReadings = systemData.totalConnections; // Uma leitura por conexão por mês
    const actualReadings = await Reading.countDocuments({
        date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    });

    systemData.readingEfficiency = (actualReadings / totalExpectedReadings) * 100;

    // Cálculo de eficiência de pagamentos
    const invoices = await Invoice.find({
        dateIssued: {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        }
    });

    const totalInvoices = invoices.length;
    const paidInvoices = invoices.filter(inv => inv.status === 'pago').length;
    
    systemData.paymentEfficiency = totalInvoices > 0 
        ? (paidInvoices / totalInvoices) * 100 
        : 0;

    res.status(200).json({
        success: true,
        data: systemData
    });
});

// Dashboard Financeiro - Agrupa informações financeiras relevantes
exports.getDashboardFinanceiro = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
        return next(new ErrorResponse('Datas inicial e final são obrigatórias', 400));
    }

    const dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
    };

    // Executa todas as queries em paralelo para melhor performance
    const [invoices, payments, expenses, salaries, customers] = await Promise.all([
        // Faturas do período
        Invoice.find({
            dateIssued: dateFilter
        }).populate('customer connection'),

        // Pagamentos do período
        Payment.find({
            date: dateFilter
        }),

        // Despesas do período
        Expense.find({
            date: dateFilter
        }),

        // Salários do período
        Salary.find({
            paymentDate: dateFilter
        }).populate('employee'),

        // Clientes com crédito
        Customer.find({
            availableCredit: { $gt: 0 }
        })
    ]);

    const dashboardData = {
        resumoFinanceiro: {
            // Receitas
            faturamentoTotal: 0,
            recebimentoTotal: 0,
            inadimplencia: 0,
            creditosDisponiveis: 0,
            
            // Despesas
            despesasTotal: 0,
            despesasFixas: 0,
            despesasVariaveis: 0,
            
            // Salários
            totalSalarios: 0,
            encargos: 0,
            
            // Resultados
            resultadoOperacional: 0,
            lucroBruto: 0,
            lucroLiquido: 0,
            margemLucro: 0
        },
        faturamentoPorCategoria: {},
        despesasPorCategoria: {},
        despesasPorTipo: {},
        salariosPorDepartamento: {},
        inadimplenciaPorCategoria: {},
        top10Devedores: [],
        fluxoCaixa: {
            entradas: {},
            saidas: {},
            saldoMensal: {}
        },
        indicadoresFinanceiros: {
            custoOperacional: 0,
            despesasAdministrativas: 0,
            indiceLucratividade: 0,
            pontoEquilibrio: 0
        }
    };

    // Processa faturas
    invoices.forEach(invoice => {
        const month = invoice.dateIssued.toISOString().slice(0, 7);
        const category = invoice.connection.category;

        // Acumula faturamento
        dashboardData.resumoFinanceiro.faturamentoTotal += invoice.totalAmount;

        // Agrupa por categoria
        if (!dashboardData.faturamentoPorCategoria[category]) {
            dashboardData.faturamentoPorCategoria[category] = {
                total: 0,
                quantidade: 0,
                inadimplencia: 0
            };
        }
        dashboardData.faturamentoPorCategoria[category].total += invoice.totalAmount;
        dashboardData.faturamentoPorCategoria[category].quantidade++;

        // Registra no fluxo de caixa
        if (!dashboardData.fluxoCaixa.entradas[month]) {
            dashboardData.fluxoCaixa.entradas[month] = 0;
        }
        dashboardData.fluxoCaixa.entradas[month] += invoice.totalAmount;

        // Calcula inadimplência por categoria
        if (invoice.status === 'não pago' || invoice.status === 'vencido') {
            dashboardData.faturamentoPorCategoria[category].inadimplencia += invoice.remainingDebt;
            dashboardData.resumoFinanceiro.inadimplencia += invoice.remainingDebt;
        }
    });

    // Processa pagamentos
    payments.forEach(payment => {
        const month = payment.date.toISOString().slice(0, 7);
        dashboardData.resumoFinanceiro.recebimentoTotal += payment.amount;
    });

    // Processa despesas
    expenses.forEach(expense => {
        const month = expense.date.toISOString().slice(0, 7);
        const amount = expense.amount;

        // Acumula totais
        dashboardData.resumoFinanceiro.despesasTotal += amount;
        
        // Classifica despesas fixas e variáveis
        if (expense.category === 'fixo') {
            dashboardData.resumoFinanceiro.despesasFixas += amount;
        } else {
            dashboardData.resumoFinanceiro.despesasVariaveis += amount;
        }

        // Agrupa por categoria
        if (!dashboardData.despesasPorCategoria[expense.category]) {
            dashboardData.despesasPorCategoria[expense.category] = 0;
        }
        dashboardData.despesasPorCategoria[expense.category] += amount;

        // Agrupa por tipo
        if (!dashboardData.despesasPorTipo[expense.type]) {
            dashboardData.despesasPorTipo[expense.type] = 0;
        }
        dashboardData.despesasPorTipo[expense.type] += amount;

        // Registra no fluxo de caixa
        if (!dashboardData.fluxoCaixa.saidas[month]) {
            dashboardData.fluxoCaixa.saidas[month] = 0;
        }
        dashboardData.fluxoCaixa.saidas[month] += amount;
    });

    // Processa salários
    salaries.forEach(salary => {
        const month = salary.paymentDate.toISOString().slice(0, 7);
        const department = salary.employee.department;
        const salaryAmount = salary.amount;
        const encargos = salary.amount * 0.3; // 30% de encargos

        // Acumula totais
        dashboardData.resumoFinanceiro.totalSalarios += salaryAmount;
        dashboardData.resumoFinanceiro.encargos += encargos;

        // Agrupa por departamento
        if (!dashboardData.salariosPorDepartamento[department]) {
            dashboardData.salariosPorDepartamento[department] = {
                salarios: 0,
                encargos: 0,
                total: 0,
                funcionarios: 0
            };
        }
        dashboardData.salariosPorDepartamento[department].salarios += salaryAmount;
        dashboardData.salariosPorDepartamento[department].encargos += encargos;
        dashboardData.salariosPorDepartamento[department].total += (salaryAmount + encargos);
        dashboardData.salariosPorDepartamento[department].funcionarios++;

        // Adiciona ao fluxo de caixa
        if (!dashboardData.fluxoCaixa.saidas[month]) {
            dashboardData.fluxoCaixa.saidas[month] = 0;
        }
        dashboardData.fluxoCaixa.saidas[month] += (salaryAmount + encargos);
    });

    // Calcula saldo mensal no fluxo de caixa
    const allMonths = [...new Set([
        ...Object.keys(dashboardData.fluxoCaixa.entradas),
        ...Object.keys(dashboardData.fluxoCaixa.saidas)
    ])].sort();

    allMonths.forEach(month => {
        const entradas = dashboardData.fluxoCaixa.entradas[month] || 0;
        const saidas = dashboardData.fluxoCaixa.saidas[month] || 0;
        dashboardData.fluxoCaixa.saldoMensal[month] = entradas - saidas;
    });

    // Calcula resultados financeiros
    dashboardData.resumoFinanceiro.lucroBruto = 
        dashboardData.resumoFinanceiro.faturamentoTotal - 
        dashboardData.resumoFinanceiro.despesasTotal;

    dashboardData.resumoFinanceiro.resultadoOperacional = 
        dashboardData.resumoFinanceiro.lucroBruto - 
        (dashboardData.resumoFinanceiro.totalSalarios + dashboardData.resumoFinanceiro.encargos);

    dashboardData.resumoFinanceiro.lucroLiquido = 
        dashboardData.resumoFinanceiro.resultadoOperacional;

    dashboardData.resumoFinanceiro.margemLucro = 
        (dashboardData.resumoFinanceiro.lucroLiquido / 
         dashboardData.resumoFinanceiro.faturamentoTotal) * 100;

    // Calcula indicadores financeiros
    dashboardData.indicadoresFinanceiros = {
        custoOperacional: dashboardData.despesasPorTipo['operacional'] || 0,
        despesasAdministrativas: dashboardData.despesasPorTipo['administrativo'] || 0,
        indiceLucratividade: dashboardData.resumoFinanceiro.margemLucro,
        pontoEquilibrio: (dashboardData.resumoFinanceiro.despesasFixas + 
                         dashboardData.resumoFinanceiro.totalSalarios) / 
                        (1 - (dashboardData.resumoFinanceiro.despesasVariaveis / 
                             dashboardData.resumoFinanceiro.faturamentoTotal))
    };

    // Calcula top 10 devedores
    dashboardData.top10Devedores = await Invoice.aggregate([
        {
            $match: {
                status: { $in: ['não pago', 'vencido'] },
                dateIssued: dateFilter
            }
        },
        {
            $group: {
                _id: '$customer',
                totalDivida: { $sum: '$remainingDebt' }
            }
        },
        {
            $sort: { totalDivida: -1 }
        },
        {
            $limit: 10
        }
    ]).exec();

    // Popula informações dos clientes devedores
    await Customer.populate(dashboardData.top10Devedores, {
        path: '_id',
        select: 'name code'
    });

    res.status(200).json({
        success: true,
        data: dashboardData
    });
});

// Dashboard Operacional - Agrupa informações de leituras e consumo
exports.getDashboardOperacional = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    const [readings, connections, notifications] = await Promise.all([
        // Busca leituras do período
        Reading.find({
            date: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }).populate('connection customer createdBy'),

        // Busca conexões ativas
        Connection.find({ active: true }),

        // Busca notificações relevantes
        Notification.find({
            type: { $in: ['abnormal_consumption', 'reading_pending'] },
            createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) }
        })
    ]);

    const dashboardData = {
        resumoOperacional: {
            totalLeituras: readings.length,
            leiturasPendentes: 0,
            consumoTotal: 0,
            consumoMedio: 0,
            leiturasAnormais: 0
        },
        consumoPorCategoria: {},
        eficienciaLeituras: {},
        alertas: {
            consumoAnormal: [],
            leiturasPendentes: []
        },
        desempenhoPorRegiao: {}
    };

    // Processa leituras
    readings.forEach(reading => {
        const category = reading.connection.category;
        const region = reading.connection.region;

        // Acumula consumo
        dashboardData.resumoOperacional.consumoTotal += reading.consumption;

        // Agrupa por categoria
        if (!dashboardData.consumoPorCategoria[category]) {
            dashboardData.consumoPorCategoria[category] = {
                consumoTotal: 0,
                quantidadeLeituras: 0,
                consumoMedio: 0
            };
        }
        dashboardData.consumoPorCategoria[category].consumoTotal += reading.consumption;
        dashboardData.consumoPorCategoria[category].quantidadeLeituras++;

        // Agrupa por região
        if (!dashboardData.desempenhoPorRegiao[region]) {
            dashboardData.desempenhoPorRegiao[region] = {
                leituras: 0,
                consumoTotal: 0,
                eficiencia: 0
            };
        }
        dashboardData.desempenhoPorRegiao[region].leituras++;
        dashboardData.desempenhoPorRegiao[region].consumoTotal += reading.consumption;

        // Verifica leituras anormais
        if (reading.consumption > reading.averageConsumption * 2) {
            dashboardData.resumoOperacional.leiturasAnormais++;
        }
    });

    // Calcula médias e eficiência
    Object.keys(dashboardData.consumoPorCategoria).forEach(category => {
        const catData = dashboardData.consumoPorCategoria[category];
        catData.consumoMedio = catData.consumoTotal / catData.quantidadeLeituras;
    });

    dashboardData.resumoOperacional.consumoMedio = 
        dashboardData.resumoOperacional.consumoTotal / readings.length;

    // Calcula leituras pendentes
    const expectedReadings = connections.length; // Uma leitura por conexão
    dashboardData.resumoOperacional.leiturasPendentes = 
        expectedReadings - dashboardData.resumoOperacional.totalLeituras;

    // Processa notificações
    notifications.forEach(notification => {
        if (notification.type === 'abnormal_consumption') {
            dashboardData.alertas.consumoAnormal.push({
                id: notification._id,
                message: notification.message,
                severity: notification.severity,
                date: notification.createdAt
            });
        } else if (notification.type === 'reading_pending') {
            dashboardData.alertas.leiturasPendentes.push({
                id: notification._id,
                message: notification.message,
                severity: notification.severity,
                date: notification.createdAt
            });
        }
    });

    res.status(200).json({
        success: true,
        data: dashboardData
    });
});

// Dashboard Administrativo - Agrupa informações gerenciais
exports.getDashboardAdministrativo = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    const [users, auditLogs, systemStats] = await Promise.all([
        // Busca atividade dos usuários
        User.find()
            .select('name role lastLogin active')
            .lean(),

        // Busca logs de auditoria
        AuditLog.find({
            date: { $gte: new Date(startDate), $lte: new Date(endDate) }
        }),

        // Busca estatísticas do sistema
        SystemStats.find({
            date: { $gte: new Date(startDate), $lte: new Date(endDate) }
        })
    ]);

    const dashboardData = {
        usuarios: {
            total: users.length,
            ativos: users.filter(u => u.active).length,
            porPerfil: {}
        },
        auditoria: {
            totalOperacoes: auditLogs.length,
            operacoesPorTipo: {},
            operacoesPorUsuario: {}
        },
        sistema: {
            disponibilidade: 0,
            tempoMedioResposta: 0,
            erros: 0
        }
    };

    // Processa dados dos usuários
    users.forEach(user => {
        if (!dashboardData.usuarios.porPerfil[user.role]) {
            dashboardData.usuarios.porPerfil[user.role] = 0;
        }
        dashboardData.usuarios.porPerfil[user.role]++;
    });

    // Processa logs de auditoria
    auditLogs.forEach(log => {
        // Por tipo de operação
        if (!dashboardData.auditoria.operacoesPorTipo[log.operation]) {
            dashboardData.auditoria.operacoesPorTipo[log.operation] = 0;
        }
        dashboardData.auditoria.operacoesPorTipo[log.operation]++;

        // Por usuário
        if (!dashboardData.auditoria.operacoesPorUsuario[log.userId]) {
            dashboardData.auditoria.operacoesPorUsuario[log.userId] = 0;
        }
        dashboardData.auditoria.operacoesPorUsuario[log.userId]++;
    });

    // Processa estatísticas do sistema
    if (systemStats.length > 0) {
        dashboardData.sistema.disponibilidade = 
            systemStats.reduce((acc, stat) => acc + stat.uptime, 0) / systemStats.length;
        
        dashboardData.sistema.tempoMedioResposta = 
            systemStats.reduce((acc, stat) => acc + stat.responseTime, 0) / systemStats.length;
        
        dashboardData.sistema.erros = 
            systemStats.reduce((acc, stat) => acc + stat.errors, 0);
    }

    res.status(200).json({
        success: true,
        data: dashboardData
    });
});

// Exportação de Relatórios
exports.exportReport = asyncHandler(async (req, res, next) => {
    const { reportType, format, ...params } = req.query;

    let reportData;
    switch (reportType) {
        case 'consumption':
            reportData = await this.getCustomerConsumptionReport(req, res, next);
            break;
        case 'financial':
            reportData = await this.getFinancialReport(req, res, next);
            break;
        case 'defaulters':
            reportData = await this.getDefaultersReport(req, res, next);
            break;
        case 'readings':
            reportData = await this.getReadingsReport(req, res, next);
            break;
        case 'efficiency':
            reportData = await this.getSystemEfficiencyReport(req, res, next);
            break;
        case 'dashboardFinanceiro':
            reportData = await this.getDashboardFinanceiro(req, res, next);
            break;
        case 'dashboardOperacional':
            reportData = await this.getDashboardOperacional(req, res, next);
            break;
        case 'dashboardAdministrativo':
            reportData = await this.getDashboardAdministrativo(req, res, next);
            break;
        default:
            return next(new ErrorResponse('Tipo de relatório inválido', 400));
    }

    let exportedFile;
    switch (format.toLowerCase()) {
        case 'pdf':
            exportedFile = await exportToPDF(reportData);
            break;
        case 'excel':
            exportedFile = await exportToExcel(reportData);
            break;
        case 'csv':
            exportedFile = await exportToCSV(reportData);
            break;
        default:
            return next(new ErrorResponse('Formato de exportação inválido', 400));
    }

    res.download(exportedFile);
});

exports.getAnaliseComparativa = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, connectionId, customerId } = req.query;

    if (!startDate || !endDate) {
        return next(new ErrorResponse('Datas inicial e final são obrigatórias', 400));
    }

    const dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
    };

    // Construir query base
    const baseQuery = {};
    if (connectionId) baseQuery.connectionId = mongoose.Types.ObjectId(connectionId);
    if (customerId) baseQuery.customerId = mongoose.Types.ObjectId(customerId);

    // Buscar dados em paralelo para melhor performance
    const [readings, invoices, payments] = await Promise.all([
        // Leituras
        Reading.find({
            ...baseQuery,
            date: dateFilter
        }).populate('connectionId customerId createdBy'),

        // Faturas
        Invoice.find({
            ...baseQuery,
            dateIssued: dateFilter
        }).populate('customer connection'),

        // Pagamentos
        Payment.find({
            ...baseQuery,
            date: dateFilter
        })
    ]);

    const analiseData = {
        resumoGeral: {
            totalLeituras: readings.length,
            totalFaturas: invoices.length,
            totalPagamentos: payments.length,
            consumoTotal: 0,
            valorTotalFaturado: 0,
            valorTotalPago: 0,
            mediaConsumo: 0,
            mediaValorFaturas: 0,
            taxaInadimplencia: 0
        },
        analiseTemporalMensal: {},
        comparativoMensal: {},
        indicadoresDesempenho: {
            tempoMedioPagamento: 0,
            percentualPagamentoPrazo: 0,
            percentualPagamentoAtraso: 0,
            desvioConsumo: 0
        },
        distribuicaoConsumo: {
            porCategoria: {},
            porFaixaConsumo: {
                '0-10': 0,
                '11-20': 0,
                '21-50': 0,
                '51-100': 0,
                '100+': 0
            }
        },
        distribuicaoPagamentos: {
            porStatus: {
                emDia: 0,
                atrasado: 0,
                parcial: 0
            },
            porMetodoPagamento: {}
        },
        anomalias: {
            consumoAnormal: [],
            pagamentosAtrasados: [],
            variacoesSignificativas: []
        }
    };

    // Processamento por mês
    const processarPorMes = (data, tipo) => {
        const month = data.date.toISOString().slice(0, 7);
        
        if (!analiseData.analiseTemporalMensal[month]) {
            analiseData.analiseTemporalMensal[month] = {
                leituras: {
                    quantidade: 0,
                    consumoTotal: 0,
                    consumoMedio: 0,
                    leiturasAnormais: 0
                },
                faturas: {
                    quantidade: 0,
                    valorTotal: 0,
                    valorMedio: 0,
                    statusDistribuicao: {
                        pago: 0,
                        'pago parcial': 0,
                        'não pago': 0,
                        vencido: 0
                    }
                },
                pagamentos: {
                    quantidade: 0,
                    valorTotal: 0,
                    valorMedio: 0,
                    pontualidade: {
                        noPrazo: 0,
                        atrasado: 0
                    }
                },
                indicadores: {
                    taxaInadimplencia: 0,
                    eficienciaCobranca: 0,
                    variacaoConsumo: 0
                }
            };
        }

        return month;
    };

    // Processar leituras
    readings.forEach(reading => {
        const month = processarPorMes(reading, 'leitura');
        const monthData = analiseData.analiseTemporalMensal[month];
        const category = reading.connectionId.category;

        // Atualizar dados mensais
        monthData.leituras.quantidade++;
        monthData.leituras.consumoTotal += reading.consumption;
        
        // Distribuição por categoria
        if (!analiseData.distribuicaoConsumo.porCategoria[category]) {
            analiseData.distribuicaoConsumo.porCategoria[category] = {
                consumoTotal: 0,
                quantidadeLeituras: 0,
                consumoMedio: 0
            };
        }
        analiseData.distribuicaoConsumo.porCategoria[category].consumoTotal += reading.consumption;
        analiseData.distribuicaoConsumo.porCategoria[category].quantidadeLeituras++;

        // Classificar por faixa de consumo
        if (reading.consumption <= 10) analiseData.distribuicaoConsumo.porFaixaConsumo['0-10']++;
        else if (reading.consumption <= 20) analiseData.distribuicaoConsumo.porFaixaConsumo['11-20']++;
        else if (reading.consumption <= 50) analiseData.distribuicaoConsumo.porFaixaConsumo['21-50']++;
        else if (reading.consumption <= 100) analiseData.distribuicaoConsumo.porFaixaConsumo['51-100']++;
        else analiseData.distribuicaoConsumo.porFaixaConsumo['100+']++;

        // Verificar anomalias de consumo
        if (reading.consumption > reading.averageConsumption * 2) {
            analiseData.anomalias.consumoAnormal.push({
                data: reading.date,
                conexao: reading.connectionId.code,
                cliente: reading.customerId.name,
                consumoAtual: reading.consumption,
                consumoMedio: reading.averageConsumption,
                variacao: ((reading.consumption - reading.averageConsumption) / reading.averageConsumption) * 100
            });
            monthData.leituras.leiturasAnormais++;
        }

        // Atualizar totais gerais
        analiseData.resumoGeral.consumoTotal += reading.consumption;
    });

    // Processar faturas
    invoices.forEach(invoice => {
        const month = processarPorMes(invoice, 'fatura');
        const monthData = analiseData.analiseTemporalMensal[month];

        // Atualizar dados mensais
        monthData.faturas.quantidade++;
        monthData.faturas.valorTotal += invoice.totalAmount;
        monthData.faturas.statusDistribuicao[invoice.status]++;

        // Atualizar totais gerais
        analiseData.resumoGeral.valorTotalFaturado += invoice.totalAmount;

        // Verificar pagamentos atrasados
        if (invoice.status === 'vencido') {
            analiseData.anomalias.pagamentosAtrasados.push({
                fatura: invoice._id,
                cliente: invoice.customer.name,
                valor: invoice.totalAmount,
                diasAtraso: Math.floor((new Date() - invoice.dueDate) / (1000 * 60 * 60 * 24))
            });
        }
    });

    // Processar pagamentos
    payments.forEach(payment => {
        const month = processarPorMes(payment, 'pagamento');
        const monthData = analiseData.analiseTemporalMensal[month];

        // Atualizar dados mensais
        monthData.pagamentos.quantidade++;
        monthData.pagamentos.valorTotal += payment.amount;

        // Verificar pontualidade
        const invoice = invoices.find(inv => inv._id.toString() === payment.invoiceId.toString());
        if (invoice) {
            const pontual = payment.date <= invoice.dueDate;
            monthData.pagamentos.pontualidade[pontual ? 'noPrazo' : 'atrasado']++;
        }

        // Distribuição por método de pagamento
        if (!analiseData.distribuicaoPagamentos.porMetodoPagamento[payment.method]) {
            analiseData.distribuicaoPagamentos.porMetodoPagamento[payment.method] = 0;
        }
        analiseData.distribuicaoPagamentos.porMetodoPagamento[payment.method]++;

        // Atualizar totais gerais
        analiseData.resumoGeral.valorTotalPago += payment.amount;
    });

    // Calcular médias e indicadores
    Object.keys(analiseData.analiseTemporalMensal).forEach(month => {
        const monthData = analiseData.analiseTemporalMensal[month];
        
        // Médias mensais
        monthData.leituras.consumoMedio = 
            monthData.leituras.quantidade > 0 ? 
            monthData.leituras.consumoTotal / monthData.leituras.quantidade : 0;

        monthData.faturas.valorMedio = 
            monthData.faturas.quantidade > 0 ? 
            monthData.faturas.valorTotal / monthData.faturas.quantidade : 0;

        monthData.pagamentos.valorMedio = 
            monthData.pagamentos.quantidade > 0 ? 
            monthData.pagamentos.valorTotal / monthData.pagamentos.quantidade : 0;

        // Indicadores mensais
        monthData.indicadores.taxaInadimplencia = 
            monthData.faturas.valorTotal > 0 ? 
            ((monthData.faturas.valorTotal - monthData.pagamentos.valorTotal) / 
             monthData.faturas.valorTotal) * 100 : 0;

        monthData.indicadores.eficienciaCobranca = 
            monthData.faturas.valorTotal > 0 ? 
            (monthData.pagamentos.valorTotal / monthData.faturas.valorTotal) * 100 : 0;

        // Preparar dados para o gráfico comparativo
        analiseData.comparativoMensal[month] = {
            consumo: monthData.leituras.consumoTotal,
            valorFaturado: monthData.faturas.valorTotal,
            valorPago: monthData.pagamentos.valorTotal,
            quantidadeLeituras: monthData.leituras.quantidade,
            quantidadeFaturas: monthData.faturas.quantidade,
            quantidadePagamentos: monthData.pagamentos.quantidade,
            taxaInadimplencia: monthData.indicadores.taxaInadimplencia,
            eficienciaCobranca: monthData.indicadores.eficienciaCobranca
        };
    });

    // Calcular médias gerais
    analiseData.resumoGeral.mediaConsumo = 
        analiseData.resumoGeral.totalLeituras > 0 ? 
        analiseData.resumoGeral.consumoTotal / analiseData.resumoGeral.totalLeituras : 0;

    analiseData.resumoGeral.mediaValorFaturas = 
        analiseData.resumoGeral.totalFaturas > 0 ? 
        analiseData.resumoGeral.valorTotalFaturado / analiseData.resumoGeral.totalFaturas : 0;

    analiseData.resumoGeral.taxaInadimplencia = 
        analiseData.resumoGeral.valorTotalFaturado > 0 ? 
        ((analiseData.resumoGeral.valorTotalFaturado - analiseData.resumoGeral.valorTotalPago) / 
         analiseData.resumoGeral.valorTotalFaturado) * 100 : 0;

    // Calcular médias por categoria
    Object.keys(analiseData.distribuicaoConsumo.porCategoria).forEach(category => {
        const catData = analiseData.distribuicaoConsumo.porCategoria[category];
        catData.consumoMedio = catData.quantidadeLeituras > 0 ? 
            catData.consumoTotal / catData.quantidadeLeituras : 0;
    });

    res.status(200).json({
        success: true,
        data: analiseData
    });
});