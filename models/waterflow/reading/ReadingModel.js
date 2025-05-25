const mongoose = require("mongoose");
const Reading = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Customer",
    required: true
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Connection',
    required: true
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Company",
    required: true
  },
  date: {
    type: Date,
    required: true
  },
  previousReading: {
    type: Number,
    min: 0,
    required: true
  },
  currentReading: {
    type: Number,
    min: 0,
    required: true
  },
  readingImage: {
    type: String,
    required: true
  },
  location: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    }
  },
  consumption: {
    type: Number,
    default: 0,
    required: true
  },
  notes: {
    type: String,
    required: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, { timestamps: true });

// Índice único por cliente e data para evitar duplicatas
Reading.index({ customerId: 1, date: 1 }, { unique: true });

// Pre middleware
Reading.pre('save', async function (next) {
  try {
    const Customer = mongoose.model("Customer");
    const ReadingModel = mongoose.model("Reading");

    // Preencher company automaticamente
    if (!this.company) {
      const customer = await Customer.findById(this.customerId);
      if (!customer) return next(new Error("Cliente não encontrado."));
      this.company = customer.company;
    }

    // Se não for atualização e previousReading está ausente
    if (this.isNew && (this.previousReading === undefined || this.previousReading === null)) {
      const lastReading = await ReadingModel.findOne({
        customerId: this.customerId,
        date: { $lt: this.date }
      }).sort({ date: -1 });

      if (lastReading) {
        this.previousReading = lastReading.currentReading;
      } else {
        this.previousReading = 0; // Primeira leitura
      }
    }

    // Cálculo de consumo
    if (this.previousReading != null && this.currentReading != null) {
      if (this.currentReading < this.previousReading) {
        return next(new Error("A leitura atual não pode ser menor que a leitura anterior."));
      }
      this.consumption = this.currentReading - this.previousReading;
    }

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.models.Reading || mongoose.model("Reading", Reading);
