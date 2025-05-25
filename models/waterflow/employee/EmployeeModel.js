const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: true,
        trim: true
    },
    position: { 
        type: String, 
        required: true,
        trim: true
    },
    department: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Department', 
        required: true 
    },
    hireDate: { 
        type: Date, 
        default: Date.now 
    },
    birthDate: { 
        type: Date, 
        required: true 
    },
    company: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Company', 
        required: true 
    },
    contact: { 
        type: String, 
        required: true,
        trim: true
    },
    email: { 
        type: String, 
        required: true, 
        unique: true, 
        trim: true,
        lowercase: true,
        match: /.+\@.+\..+/ 
    },
    salaryBase: {
        type: Number, 
        required: true,
        min: 0
    },
    salaryCurrency: {
        type: String, 
        default: 'MZN'
    },
    active: { 
        type: Boolean, 
        default: true 
    }
}, { 
    timestamps: true 
});

// Método para atualizar o salário base
employeeSchema.methods.updateBaseSalary = function(newBaseSalary) {
    if (newBaseSalary <= 0) {
        throw new Error("O salário base não pode ser menor ou igual a zero");
    }
    this.salaryBase = newBaseSalary;
    return this.save();
};

// Método para verificar se o funcionário é maior de idade
employeeSchema.methods.isAdult = function() {
    const today = new Date();
    const age = today.getFullYear() - this.birthDate.getFullYear();
    const monthDiff = today.getMonth() - this.birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < this.birthDate.getDate())) {
        age--;
    }
    
    return age >= 18;
};

// Método para obter o histórico de processamentos de salário
employeeSchema.methods.getSalaryProcessingHistory = async function() {
    return await mongoose.model('Salary').findByEmployee(this._id);
};

// Índices para melhorar a performance das consultas
employeeSchema.index({ name: 1 });
employeeSchema.index({ email: 1 }, { unique: true });
employeeSchema.index({ company: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ active: 1 });
employeeSchema.index({ 'salaryBase': 1 });

employeeSchema.methods.deactivate = function() {
    this.active = false;
    return this.save();
};

employeeSchema.methods.updateInfo = function(updatedData) {
    Object.assign(this, updatedData);
    return this.save();
};

employeeSchema.statics.findActiveEmployees = function() {
    return this.find({ active: true });
};

module.exports = mongoose.model("Employee", employeeSchema);
