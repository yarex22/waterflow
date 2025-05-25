const mongoose = require("mongoose");
const { ObjectId } = mongoose.Schema;
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
// Define o esquema do usuário
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  contact: { type: String, required: true },
  password: { type: String, required: true },
  isEmployee: { type: Boolean, default: false },
  role: { 
    type: String, 
    enum: ['admin', 'manager', 'reader', 'report_viewer'],
    required: true 
  },
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: false }, // Opcional: pode ser um funcionário ou não
  company: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Company', 
    required: function() {
      return !['admin', 'report_viewer'].includes(this.role); // Company não é obrigatório para admin e report_viewer
    }
  },
  active: { type: Boolean, default: true },
  refreshToken: {
    type: String,
    select: false // Não incluir por padrão nas queries
  },
  refreshTokenExpires: {
    type: Date,
    select: false
  },
  lastLogin: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Criar índices de pesquisa
userSchema.index({ firstName: "text", email: "text" });

//compare user password
userSchema.methods.comparePassword = async function (enteredPassword) {
  // return await bcrypt.compare(enteredPassword, this.password);
  return await bcrypt.compare(enteredPassword, this.password);

};

//return a JWT token
userSchema.methods.getJwtToken = function () {
  const token = jwt.sign({ id: this._id }, process.env.JWT_SECRET, {
    expiresIn: 3600,
  });
  return token;
};


// Método para gerar JWT Token
userSchema.methods.getJwtToken = function () {
  return jwt.sign(
    { 
      id: this._id,
      username: this.username,
      role: this.role 
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '1h',
      algorithm: 'HS512'
    }
  );
};

// Método para gerar Refresh Token
userSchema.methods.generateRefreshToken = function () {
  const refreshToken = crypto.randomBytes(40).toString('hex');
  this.refreshToken = refreshToken;
  this.refreshTokenExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias
  return refreshToken;
};
// Criar o modelo de usuário
const User = mongoose.model("User", userSchema);

// Forçar recriação dos índices
User.syncIndexes().then(() => {
  console.log('Índices do User sincronizados');
}).catch(err => {
  console.error('Erro ao sincronizar índices:', err);
});

module.exports = User;
