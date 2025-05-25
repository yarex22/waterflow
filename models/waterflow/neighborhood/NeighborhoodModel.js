const mongoose = require('mongoose');

const neighborhoodSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    district: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
    population: { type: Number, min: 0 },
    area: { type: Number, min: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date }
}, { timestamps: true });

neighborhoodSchema.methods.updatePopulation = function(newPopulation) {
    if (newPopulation < 0) throw new Error("A população não pode ser negativa.");
    this.population = newPopulation;
    return this.save();
};

neighborhoodSchema.methods.updateArea = function(newArea) {
    if (newArea < 0) throw new Error("A área não pode ser negativa.");
    this.area = newArea;
    return this.save();
};

neighborhoodSchema.statics.findByName = function(name) {
    return this.findOne({ name });
};

neighborhoodSchema.statics.listAllNeighborhoods = function() {
    return this.find({}).populate('district');
};

module.exports = mongoose.model("Neighborhood", neighborhoodSchema);