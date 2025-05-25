// utils/calculateWaterBill.js

function calculateWaterBill(category, consumption, system) {
    if (!system) throw new Error("Sistema não encontrado.");
  
    let totalAmount = 0;
  
    if (category === "Fontanários") {
      totalAmount = consumption * system.fontanarios;
    } 
    
    else if (category === "Doméstico") {
      totalAmount = system.taxaDisponibilidade;
      const tarifa = system.domestico;
  
      if (consumption > tarifa.escalao1.min) {
        const consumo1 = Math.min(consumption, tarifa.escalao1.max) - tarifa.escalao1.min;
        totalAmount += consumo1 * tarifa.escalao1.valor;
      }
  
      if (consumption > tarifa.escalao2.min) {
        const consumo2 = Math.min(consumption, tarifa.escalao2.max) - tarifa.escalao2.min;
        totalAmount += consumo2 * tarifa.escalao2.valor;
      }
  
      if (consumption > tarifa.escalao3.min) {
        const consumo3 = consumption - tarifa.escalao3.min;
        totalAmount += consumo3 * tarifa.escalao3.valor;
      }
    } 
    
    else if (category === "Município") {
      totalAmount = system.taxaDisponibilidade;
      const tarifa = system.municipio;
  
      if (tarifa.useEscaloes) {
        if (consumption > tarifa.escalao1.min) {
          const consumo1 = Math.min(consumption, tarifa.escalao1.max) - tarifa.escalao1.min;
          totalAmount += consumo1 * tarifa.escalao1.valor;
        }
  
        if (consumption > tarifa.escalao2.min) {
          const consumo2 = Math.min(consumption, tarifa.escalao2.max) - tarifa.escalao2.min;
          totalAmount += consumo2 * tarifa.escalao2.valor;
        }
  
        if (consumption > tarifa.escalao3.min) {
          const consumo3 = consumption - tarifa.escalao3.min;
          totalAmount += consumo3 * tarifa.escalao3.valor;
        }
      } else {
        totalAmount += consumption * tarifa.taxaFixa;
      }
    } 
    
    else if (category === "Comércio Público") {
      totalAmount = system.comercioPublico.taxaBase;
      if (consumption > system.comercioPublico.consumoMinimo) {
        totalAmount += (consumption - system.comercioPublico.consumoMinimo) * system.comercioPublico.tarifaAcimaMinimo;
      }
    } 
    
    else if (category === "Indústria") {
      totalAmount = system.industria.taxaBase;
      if (consumption > system.industria.consumoMinimo) {
        totalAmount += (consumption - system.industria.consumoMinimo) * system.industria.tarifaAcimaMinimo;
      }
    }
  
    return totalAmount;
  }
  
  module.exports = { calculateWaterBill };
  