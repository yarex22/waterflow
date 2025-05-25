// controllers/waterflow/energy/energyController.js
const asyncHandler = require('../../../middleware/asyncHandler');
const Energy = require('../../../models/waterflow/energy/EnergyModel');
const WaterReading = require('../../../models/waterflow/reading/ReadingModel');
const Expense = require('../../../models/waterflow/expenses/ExpenseModel');
const Invoice = require('../../../models/waterflow/invoice/InvoiceModel');
const Payment = require('../../../models/waterflow/payment/PaymentModel');
const ErrorResponse = require('../../../utils/ErrorResponse');

// @desc    Registrar consumo de energia
// @route   POST /api/v1/energy
// @access  Private
exports.createEnergyReading = asyncHandler(async (req, res, next) => {
    const { month, consumo_kw, valor_total } = req.body;

    const energia = await Energy.create({
        month,
        company: req.user.company,
        consumo_kw,
        valor_total,
        createdBy: req.user.id
    });

    res.status(201).json({
        success: true,
        data: energia
    });
});

// @desc    Buscar registro de energia por mês
// @route   GET /api/v1/energy/:month/:company
// @access  Private
exports.getEnergyByMonth = asyncHandler(async (req, res, next) => {
    const { month, company } = req.params;

    const energia = await Energy.findOne({ month, company });

    if (!energia) {
        return next(new ErrorResponse(`Registro não encontrado para o mês ${month}`, 404));
    }

    res.status(200).json({
        success: true,
        data: energia
    });
});

// @desc    Gerar relatório de energia
// @route   GET /api/v1/energy/report
// @access  Private
exports.generateEnergyReport = asyncHandler(async (req, res, next) => {
    const { startDate, endDate, company } = req.query;

    if (!startDate || !endDate) {
        return next(new ErrorResponse('Por favor, forneça as datas inicial e final', 400));
    }

    // 1. Buscar registros de energia
    const registrosEnergia = await Energy.find({
        company,
        month: { $gte: startDate, $lte: endDate }
    }).sort({ month: 1 });

    // 2. Gerar relatório com dados dinâmicos
    const relatorio = await Promise.all(registrosEnergia.map(async (energia) => {
        const monthStart = new Date(energia.month + '-01');
        const monthEnd = new Date(energia.month + '-31');

        // Buscar dados relacionados
        const [leituras, despesas, faturas, pagamentos] = await Promise.all([
            WaterReading.find({
                company,
                date: { $gte: monthStart, $lte: monthEnd }
            }),
            Expense.find({
                company,
                date: { $gte: monthStart, $lte: monthEnd }
            }),
            Invoice.find({
                company,
                month: energia.month
            }),
            Payment.find({
                company,
                date: { $gte: monthStart, $lte: monthEnd }
            })
        ]);

        // Cálculos do mês
        const consumoAgua = leituras.reduce((sum, l) => sum + l.consumption, 0);
        const totalDespesas = despesas.reduce((sum, d) => sum + d.amount, 0);
        const totalPagamentos = pagamentos.reduce((sum, p) => sum + p.amount, 0);

        return {
            month: energia.month,
            energia: {
                consumo_kw: energia.consumo_kw,
                valor_total: energia.valor_total,
                valor_por_kw: energia.valor_por_kw,
                percentual_despesas: (energia.valor_total / totalDespesas) * 100
            },
            agua: {
                consumo_total: consumoAgua,
                kw_por_m3: consumoAgua > 0 ? energia.consumo_kw / consumoAgua : 0,
                custo_energia_por_m3: consumoAgua > 0 ? energia.valor_total / consumoAgua : 0
            },
            financeiro: {
                despesas_totais: totalDespesas,
                pagamentos: totalPagamentos,
                saldo: totalPagamentos - totalDespesas
            },
            faturas: faturas.map(f => ({
                numero: f.number,
                valor: f.amount,
                status: f.status,
                vencimento: f.dueDate
            })),
            indicadores: {
                eficiencia_energetica: consumoAgua > 0 ? energia.consumo_kw / consumoAgua : 0,
                custo_medio_kw: energia.valor_por_kw
            }
        };
    }));

    // 3. Calcular totais do período
    const totaisPeriodo = relatorio.reduce((acc, curr) => ({
        total_kw: acc.total_kw + curr.energia.consumo_kw,
        total_energia: acc.total_energia + curr.energia.valor_total,
        total_despesas: acc.total_despesas + curr.financeiro.despesas_totais,
        total_pagamentos: acc.total_pagamentos + curr.financeiro.pagamentos,
        total_consumo_agua: acc.total_consumo_agua + curr.agua.consumo_total
    }), {
        total_kw: 0,
        total_energia: 0,
        total_despesas: 0,
        total_pagamentos: 0,
        total_consumo_agua: 0
    });

    const numeroMeses = relatorio.length;

    res.status(200).json({
        success: true,
        data: {
            periodo: {
                inicio: startDate,
                fim: endDate
            },
            relatorios: relatorio,
            totais: {
                ...totaisPeriodo,
                media_mensal_kw: totaisPeriodo.total_kw / numeroMeses,
                media_mensal_valor: totaisPeriodo.total_energia / numeroMeses,
                valor_medio_por_kw: totaisPeriodo.total_energia / totaisPeriodo.total_kw,
                media_consumo_agua: totaisPeriodo.total_consumo_agua / numeroMeses,
                eficiencia_media: totaisPeriodo.total_kw / totaisPeriodo.total_consumo_agua,
                percentual_energia_despesas: (totaisPeriodo.total_energia / totaisPeriodo.total_despesas) * 100
            }
        }
    });
});

// @desc    Atualizar registro de energia
// @route   PUT /api/v1/energy/:id
// @access  Private
exports.updateEnergyReading = asyncHandler(async (req, res, next) => {
    let energia = await Energy.findById(req.params.id);

    if (!energia) {
        return next(new ErrorResponse(`Registro não encontrado com id ${req.params.id}`, 404));
    }

    energia = await Energy.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
        runValidators: true
    });

    res.status(200).json({
        success: true,
        data: energia
    });
});

// @desc    Deletar registro de energia
// @route   DELETE /api/v1/energy/:id
// @access  Private
exports.deleteEnergyReading = asyncHandler(async (req, res, next) => {
    const energia = await Energy.findById(req.params.id);

    if (!energia) {
        return next(new ErrorResponse(`Registro não encontrado com id ${req.params.id}`, 404));
    }

    await energia.remove();

    res.status(200).json({
        success: true,
        data: {}
    });
});