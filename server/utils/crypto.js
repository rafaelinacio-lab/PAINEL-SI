const crypto = require('crypto');

// Chave de criptografia - em produção, usar variável de ambiente
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'sua-chave-secreta-aqui-min-32-caracteres!!!!!';
const ALGORITHM = 'aes-256-cbc';

// Garantir que a chave tenha 32 caracteres
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').substring(0, 32));
  return key;
}

function encryptToken(token) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
    
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Retornar IV + encrypted token
    return iv.toString('hex') + ':' + encrypted;
  } catch (error) {
    console.error('Erro ao criptografar token:', error);
    throw new Error('Erro ao criptografar token');
  }
}

function decryptToken(encryptedData) {
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) {
      throw new Error('Formato de token criptografado inválido');
    }
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Erro ao descriptografar token:', error);
    throw new Error('Erro ao descriptografar token');
  }
}

module.exports = {
  encryptToken,
  decryptToken
};
