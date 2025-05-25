// models/waterflow/energy/EnergyModel.js
const mongoose = require('mongoose');

const EnergySchema = new mongoose.Schema({
    month: {
        type: String,
        required: [true, 'Mês é obrigatório'],
        validate: {
            validator: function(v) {
                return /^\d{4}-(?:0[1-9]|1[0-2])$/.test(v);
            },
            message: props => `${props.value} não é um formato válido de ano-mês (YYYY-MM)!`
        }
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    consumo_kw: {
        type: Number,
        required: [true, 'Consumo em kilowatts é obrigatório'],
        min: 0
    },
    valor_total: {
        type: Number,
        required: [true, 'Valor total é obrigatório'],
        min: 0
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Índice composto para garantir unicidade de mês por empresa
EnergySchema.index({ month: 1, company: 1 }, { unique: true });

// Virtual para calcular valor por KW
EnergySchema.virtual('valor_por_kw').get(function() {
    return this.consumo_kw > 0 ? this.valor_total / this.consumo_kw : 0;
});

// Middleware para calcular valores antes de salvar
EnergySchema.pre('save', function(next) {
    // Calcular consumo total em KWh
    this.consumo.total_kwh = this.consumo.leitura_atual - this.consumo.leitura_anterior;

    // Calcular valor total
    this.custos.valor_total = 
        (this.consumo.total_kwh * this.custos.valor_kwh) + 
        this.custos.impostos + 
        this.custos.taxas_adicionais;

    // Calcular consumo médio diário
    const diasNoMes = new Date(this.month.slice(0, 4), this.month.slice(5, 7), 0).getDate();
    this.indicadores.consumo_medio_diario = this.consumo.total_kwh / diasNoMes;

    next();
});

// Método para calcular variação em relação ao mês anterior
EnergySchema.methods.calcularVariacaoMensal = async function() {
    const [ano, mes] = this.month.split('-');
    const mesAnterior = mes === '01' 
        ? `${Number(ano)-1}-12`
        : `${ano}-${String(Number(mes)-1).padStart(2, '0')}`;

    const consumoAnterior = await this.constructor.findOne({
        month: mesAnterior,
        company: this.company
    });

    if (!consumoAnterior) return 0;

    return ((this.consumo.total_kwh - consumoAnterior.consumo.total_kwh) / 
            consumoAnterior.consumo.total_kwh) * 100;
};

// Método para atualizar custo por m³ de água
EnergySchema.methods.atualizarCustoPorM3Agua = async function(consumoAgua) {
    if (consumoAgua > 0) {
        this.indicadores.custo_por_m3_agua = this.custos.valor_total / consumoAgua;
        await this.save();
    }
    return this.indicadores.custo_por_m3_agua;
};

// Método para registrar pagamento
EnergySchema.methods.registrarPagamento = async function(dataPagamento) {
    this.fatura.status = 'pago';
    this.fatura.data_pagamento = dataPagamento;
    return this.save();
};

// Virtual para calcular dias até vencimento
EnergySchema.virtual('diasAteVencimento').get(function() {
    if (this.fatura.status === 'pago') return 0;
    return Math.ceil((this.fatura.data_vencimento - new Date()) / (1000 * 60 * 60 * 24));
});

// Método estático para buscar consumo por período
EnergySchema.statics.buscarConsumoPeriodo = function(startMonth, endMonth, company) {
    return this.find({
        month: { $gte: startMonth, $lte: endMonth },
        company
    }).sort({ month: 1 });
};

// Método estático para relatório de consumo por equipamento
EnergySchema.statics.relatorioEquipamentos = async function(month, company) {
    const energia = await this.findOne({ month, company });
    if (!energia) return null;

    return energia.equipamentos.map(eq => ({
        equipamento: eq.nome,
        consumo: eq.consumo_estimado,
        percentualTotal: (eq.consumo_estimado / energia.consumo.total_kwh) * 100,
        custoEstimado: (eq.consumo_estimado / energia.consumo.total_kwh) * energia.custos.valor_total
    }));
};

module.exports = mongoose.model('Energy', EnergySchema);