const mongoose = require('mongoose');
const Connection = require('../models/waterflow/connection/ConnectionModel');
const Reading = require('../models/waterflow/reading/ReadingModel');
const Invoice = require('../models/waterflow/invoice/InvoiceModel');

async function updateConnections() {
    try {
        // Conectar ao MongoDB - using development URI for testing
        await mongoose.connect('mongodb://localhost:27017/waterflow');
        console.log('Conectado ao MongoDB');

        // Buscar todas as conexões sem company
        const connectionsWithoutCompany = await Connection.find({ company: { $exists: false } });
        console.log(`Encontradas ${connectionsWithoutCompany.length} conexões sem company`);

        // Para cada conexão
        for (const connection of connectionsWithoutCompany) {
            // Primeiro tentar encontrar uma leitura
            let reading = await Reading.findOne({ 
                connection: connection._id,
                company: { $exists: true } 
            });

            if (reading) {
                // Atualizar a conexão com a company da leitura
                await Connection.findByIdAndUpdate(
                    connection._id,
                    { company: reading.company },
                    { new: true }
                );
                console.log(`Conexão ${connection._id} atualizada com company ${reading.company} (da leitura)`);
                continue;
            }

            // Se não encontrou leitura, tentar fatura
            let invoice = await Invoice.findOne({
                connection: connection._id,
                company: { $exists: true }
            });

            if (invoice) {
                // Atualizar a conexão com a company da fatura
                await Connection.findByIdAndUpdate(
                    connection._id,
                    { company: invoice.company },
                    { new: true }
                );
                console.log(`Conexão ${connection._id} atualizada com company ${invoice.company} (da fatura)`);
            } else {
                console.log(`Nenhuma leitura ou fatura encontrada para conexão ${connection._id}`);
            }
        }

        console.log('Processo finalizado');
        process.exit(0);
    } catch (error) {
        console.error('Erro:', error);
        process.exit(1);
    }
}

updateConnections(); 