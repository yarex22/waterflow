// models/waterflow/report/ConsolidatedReportModel.js
const mongoose = require('mongoose');

const ConsolidatedReportSchema = new mongoose.Schema({
    month: {
        type: String,
        required: true,
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
    despesas: {
        energia: {
            type: Number,
            required: true,
            default: 0
        },
        outras: {
            type: Number,
            required: true,
            default: 0
        },
        salarios: {
            type: Number,
            required: true,
            default: 0
        },
        totalDespesas: {
            type: Number,
            required: true,
            default: 0
        }
    },
    consumoAgua: {
        total: {
            type: Number,
            required: true,
            default: 0
        },
        quantidade: {
            type: Number,
            required: true,
            default: 0
        },
        media: {
            type: Number,
            required: true,
            default: 0
        }
    },
    faturamento: {
        totalFaturado: {
            type: Number,
            required: true,
            default: 0
        },
        totalPago: {
            type: Number,
            required: true,
            default: 0
        },
        totalEmAberto: {
            type: Number,
            required: true,
            default: 0
        },
        quantidadeFaturas: {
            type: Number,
            required: true,
            default: 0
        },
        quantidadePagas: {
            type: Number,
            required: true,
            default: 0
        },
        quantidadeEmAberto: {
            type: Number,
            required: true,
            default: 0
        }
    },
    indicadores: {
        margemOperacional: {
            type: Number,
            required: true,
            default: 0
        },
        taxaInadimplencia: {
            type: Number,
            required: true,
            default: 0
        },
        custosPorM3: {
            type: Number,
            required: true,
            default: 0
        }
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
    timestamps: true 
});

// Índice composto para garantir unicidade por mês e empresa
ConsolidatedReportSchema.index({ month: 1, company: 1 }, { unique: true });

// Middleware pre-save para calcular totais e indicadores
ConsolidatedReportSchema.pre('save', function(next) {
    // Calcula total de despesas
    this.despesas.totalDespesas = 
        this.despesas.energia + 
        this.despesas.outras + 
        this.despesas.salarios;

    // Calcula média de consumo
    this.consumoAgua.media = this.consumoAgua.quantidade > 0 
        ? this.consumoAgua.total / this.consumoAgua.quantidade 
        : 0;

    // Calcula indicadores
    this.indicadores.margemOperacional = this.faturamento.totalFaturado > 0
        ? ((this.faturamento.totalFaturado - this.despesas.totalDespesas) / 
           this.faturamento.totalFaturado) * 100
        : 0;

    this.indicadores.taxaInadimplencia = this.faturamento.totalFaturado > 0
        ? (this.faturamento.totalEmAberto / this.faturamento.totalFaturado) * 100
        : 0;

    this.indicadores.custosPorM3 = this.consumoAgua.total > 0
        ? this.despesas.totalDespesas / this.consumoAgua.total
        : 0;

    next();
});

// Método estático para buscar relatório por mês
ConsolidatedReportSchema.statics.findByMonth = function(month, company) {
    return this.findOne({ month, company });
};

// Método estático para buscar relatórios por período
ConsolidatedReportSchema.statics.findByPeriod = function(startMonth, endMonth, company) {
    return this.find({
        month: { $gte: startMonth, $lte: endMonth },
        company
    }).sort({ month: 1 });
};

// Método para atualizar dados do relatório
ConsolidatedReportSchema.methods.updateData = async function(newData) {
    Object.assign(this, newData);
    return this.save();
};

// Método para calcular variação em relação ao mês anterior
ConsolidatedReportSchema.methods.getVariacaoMensal = async function() {
    const [ano, mes] = this.month.split('-');
    const mesAnterior = mes === '01' 
        ? `${Number(ano)-1}-12`
        : `${ano}-${String(Number(mes)-1).padStart(2, '0')}`;

    const relatorioAnterior = await this.constructor.findOne({
        month: mesAnterior,
        company: this.company
    });

    if (!relatorioAnterior) return null;

    return {
        despesas: {
            total: this.calcularVariacao(
                this.despesas.totalDespesas,
                relatorioAnterior.despesas.totalDespesas
            ),
            energia: this.calcularVariacao(
                this.despesas.energia,
                relatorioAnterior.despesas.energia
            )
        },
        consumo: this.calcularVariacao(
            this.consumoAgua.total,
            relatorioAnterior.consumoAgua.total
        ),
        faturamento: this.calcularVariacao(
            this.faturamento.totalFaturado,
            relatorioAnterior.faturamento.totalFaturado
        ),
        inadimplencia: this.calcularVariacao(
            this.indicadores.taxaInadimplencia,
            relatorioAnterior.indicadores.taxaInadimplencia
        )
    };
};

// Método auxiliar para calcular variação percentual
ConsolidatedReportSchema.methods.calcularVariacao = function(atual, anterior) {
    if (!anterior) return null;
    return ((atual - anterior) / anterior) * 100;
};

module.exports = mongoose.model('ConsolidatedReport', ConsolidatedReportSchema);