const express = require('express');
const router = express.Router();
const path = require('path');
const { isAuthenticated } = require('../middleware/auth');

// Rota pública para servir imagens
router.get('/public/:filename', (req, res) => {
    try {
        const filename = req.params.filename;
        // Sanitize o nome do arquivo para evitar directory traversal
        const sanitizedFilename = path.normalize(filename).replace(/^(\.\.(\/|\\|$))+/, '');
        const filePath = path.join(__dirname, '../uploads', sanitizedFilename);
        res.sendFile(filePath);
    } catch (error) {
        console.error('Erro ao servir imagem:', error);
        res.status(404).send('Imagem não encontrada');
    }
});

// Rotas protegidas para upload
router.post('/upload', isAuthenticated, /* seu middleware de upload */);

module.exports = router; 