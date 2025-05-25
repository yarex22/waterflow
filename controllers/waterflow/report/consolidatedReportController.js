// controllers/waterflow/reports/consolidatedReportController.js
const asyncHandler = require('../../../middleware/asyncHandler');
const ErrorResponse = require('../../../utils/ErrorResponse');
const ConsolidatedReport = require('../../../models/waterflow/report/ConsolidatedReportModel');
const EnergyExpense = require('../../../models/waterflow/energyExpense/EnergyExpenseModel');
const Expense = require('../../../models/waterflow/expense/ExpenseModel');
const Salary = require('../../../models/waterflow/salary/SalaryModel');
const Reading = require('../../../models/waterflow/reading/ReadingModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Payment = require('../../../models/waterflow/payment/PaymentModel');

// @desc    Criar ou atualizar relatório mensal
// @route   POST /api/reports/mensal/consolidado
// @access  Private (Admin, Financeiro)
exports.createUpdateMonthlyReport = asyncHandler(async (req, res, next) => {
    const { month } = req.body;

    if (!month || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
        return next(new ErrorResponse('Mês inválido. Use formato YYYY-MM', 400));
    }

    // Buscar dados do mês
    const monthData = await collectMonthData(month, req.user.company);

    // Buscar ou criar relatório
    let report = await ConsolidatedReport.findByMonth(month, req.user.company);

    if (report) {
        // Atualizar relatório existente
        report = await report.updateData({
            ...monthData,
            updatedBy: req.user._id
        });
    } else {
        // Criar novo relatório
        report = await ConsolidatedReport.create({
            ...monthData,
            month,
            company: req.user.company,
            createdBy: req.user._id
        });
    }

    res.status(200).json({
        success: true,
        data: report
    });
});

// @desc    Obter relatório mensal consolidado
// @route   GET /api/reports/mensal/consolidado
// @access  Private (Admin, Financeiro, Gerente)
exports.getRelatorioMensalConsolidado = asyncHandler(async (req, res, next) => {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
        return next(new ErrorResponse('Datas inicial e final são obrigatórias', 400));
    }

    const startMonth = new Date(startDate).toISOString().slice(0, 7);
    const endMonth = new Date(endDate).toISOString().slice(0, 7);

    // Buscar relatórios do período
    let relatorios = await ConsolidatedReport.findByPeriod(
        startMonth,
        endMonth,
        req.user.company
    );

    // Se não existirem relatórios, criar novos
    if (relatorios.length === 0) {
        relatorios = await createMissingReports(startMonth, endMonth, req.user);
    }

    // Adicionar variações mensais
    const relatoriosComVariacao = await Promise.all(
        relatorios.map(async (relatorio) => {
            const variacao = await relatorio.getVariacaoMensal();
            return {
                ...relatorio.toObject(),
                variacao
            };
        })
    );

    // Calcular totais e médias do período
    const resumoPeriodo = calcularResumoPeriodo(relatoriosComVariacao);

    res.status(200).json({
        success: true,
        data: {
            relatorios: relatoriosComVariacao,
            resumoPeriodo
        }
    });
});

// @desc    Obter relatório de um mês específico
// @route   GET /api/reports/mensal/:month
// @access  Private (Admin, Financeiro, Gerente)
exports.getMonthlyReport = asyncHandler(async (req, res, next) => {
    const { month } = req.params;

    if (!month || !/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month)) {
        return next(new ErrorResponse('Mês inválido. Use formato YYYY-MM', 400));
    }

    const report = await ConsolidatedReport.findByMonth(month, req.user.company);

    if (!report) {
        return next(new ErrorResponse('Relatório não encontrado para este mês', 404));
    }

    const variacao = await report.getVariacaoMensal();

    res.status(200).json({
        success: true,
        data: {
            ...report.toObject(),
            variacao
        }
    });
});

// Funções auxiliares
const collectMonthData = async (month, company) => {
    const startDate = new Date(`${month}-01`);
    const endDate = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0);

    const [energyExpenses, expenses, salaries, readings, invoices, payments] = await Promise.all([
        // Gastos de energia
        EnergyExpense.find({
            month,
            company
        }),

        // Outras despesas
        Expense.find({
            company,
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }),

        // Salários
        Salary.find({
            company,
            paymentDate: {
                $gte: startDate,
                $lte: endDate
            }
        }),

        // Leituras
        Reading.find({
            company,
            date: {
                $gte: startDate,
                $lte: endDate
            }
        }),

        // Faturas
        Invoice.find({
            company,
            dateIssued: {
                $gte: startDate,
                $lte: endDate
            }
        }),

        // Pagamentos
        Payment.find({
            company,
            date: {
                $gte: startDate,
                $lte: endDate
            }
        })
    ]);

    // Processar despesas
    const despesas = {
        energia: energyExpenses.reduce((sum, exp) => sum + exp.amount, 0),
        outras: expenses.reduce((sum, exp) => sum + exp.amount, 0),
        salarios: salaries.reduce((sum, sal) => sum + sal.amount, 0),
        totalDespesas: 0 // Será calculado pelo modelo
    };

    // Processar consumo de água
    const consumoAgua = {
        total: readings.reduce((sum, reading) => sum + reading.consumption, 0),
        quantidade: readings.length,
        media: 0 // Será calculado pelo modelo
    };

    // Processar faturamento
    const faturamento = {
        totalFaturado: invoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
        totalPago: payments.reduce((sum, pay) => sum + pay.amount, 0),
        totalEmAberto: 0, // Será calculado
        quantidadeFaturas: invoices.length,
        quantidadePagas: invoices.filter(inv => inv.status === 'pago').length,
        quantidadeEmAberto: invoices.filter(inv => inv.status !== 'pago').length
    };

    faturamento.totalEmAberto = faturamento.totalFaturado - faturamento.totalPago;

    return {
        despesas,
        consumoAgua,
        faturamento,
        indicadores: {} // Será calculado pelo modelo
    };
};

const createMissingReports = async (startMonth, endMonth, user) => {
    const months = getMonthsBetween(startMonth, endMonth);
    const reports = [];

    for (const month of months) {
        const monthData = await collectMonthData(month, user.company);
        const report = await ConsolidatedReport.create({
            ...monthData,
            month,
            company: user.company,
            createdBy: user._id
        });
        reports.push(report);
    }

    return reports;
};

const calcularResumoPeriodo = (relatorios) => {
    const resumo = {
        despesas: {
            totalEnergia: 0,
            totalOutras: 0,
            totalSalarios: 0,
            totalGeral: 0,
            mediaMensal: 0
        },
        consumo: {
            totalAgua: 0,
            mediaConsumoMensal: 0,
            totalLeituras: 0
        },
        faturamento: {
            totalFaturado: 0,
            totalPago: 0,
            totalEmAberto: 0,
            mediaFaturamentoMensal: 0
        },
        indicadores: {
            margemOperacionalMedia: 0,
            taxaInadimplenciaMedia: 0,
            custoMedioPorM3: 0
        }
    };

    relatorios.forEach(relatorio => {
        // Somar despesas
        resumo.despesas.totalEnergia += relatorio.despesas.energia;
        resumo.despesas.totalOutras += relatorio.despesas.outras;
        resumo.despesas.totalSalarios += relatorio.despesas.salarios;
        resumo.despesas.totalGeral += relatorio.despesas.totalDespesas;

        // Somar consumo
        resumo.consumo.totalAgua += relatorio.consumoAgua.total;
        resumo.consumo.totalLeituras += relatorio.consumoAgua.quantidade;

        // Somar faturamento
        resumo.faturamento.totalFaturado += relatorio.faturamento.totalFaturado;
        resumo.faturamento.totalPago += relatorio.faturamento.totalPago;
        resumo.faturamento.totalEmAberto += relatorio.faturamento.totalEmAberto;
    });

    const numMeses = relatorios.length;

    // Calcular médias
    resumo.despesas.mediaMensal = resumo.despesas.totalGeral / numMeses;
    resumo.consumo.mediaConsumoMensal = resumo.consumo.totalAgua / numMeses;
    resumo.faturamento.mediaFaturamentoMensal = resumo.faturamento.totalFaturado / numMeses;

    // Calcular indicadores médios
    resumo.indicadores.margemOperacionalMedia = 
        ((resumo.faturamento.totalFaturado - resumo.despesas.totalGeral) / 
         resumo.faturamento.totalFaturado) * 100;

    resumo.indicadores.taxaInadimplenciaMedia = 
        (resumo.faturamento.totalEmAberto / resumo.faturamento.totalFaturado) * 100;

    resumo.indicadores.custoMedioPorM3 = 
        resumo.consumo.totalAgua > 0 ? 
        resumo.despesas.totalGeral / resumo.consumo.totalAgua : 0;

    return resumo;
};

const getMonthsBetween = (startMonth, endMonth) => {
    const months = [];
    const [startYear, startM] = startMonth.split('-');
    const [endYear, endM] = endMonth.split('-');
    const start = new Date(startYear, startM - 1);
    const end = new Date(endYear, endM - 1);

    while (start <= end) {
        months.push(
            `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
        );
        start.setMonth(start.getMonth() + 1);
    }

    return months;
};