const mongoose = require("mongoose");

const systemStatsSchema = new mongoose.Schema({
    // Métricas do sistema
    totalUsers: {
        type: Number,
        default: 0
    },
    totalCompanies: {
        type: Number,
        default: 0
    },
    totalCustomers: {
        type: Number,
        default: 0
    },
    totalReadings: {
        type: Number,
        default: 0
    },
    // Métricas de uso
    activeUsers: {
        type: Number,
        default: 0
    },
    dailyTransactions: {
        type: Number,
        default: 0
    },
    // Métricas de desempenho
    averageResponseTime: {
        type: Number,
        default: 0
    },
    systemUptime: {
        type: Number,
        default: 0
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    },
    // Métricas de erro
    errorCount: {
        type: Number,
        default: 0
    },
    // Status do sistema
    systemStatus: {
        type: String,
        enum: ['Online', 'Maintenance', 'Offline'],
        default: 'Online'
    }
}, {
    timestamps: true
});

// Índice para otimizar consultas por data
systemStatsSchema.index({ lastUpdated: -1 });

module.exports = mongoose.model("SystemStats", systemStatsSchema);