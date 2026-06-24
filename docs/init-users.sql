-- Script de Inicialização do Sistema de Autenticação
-- ====================================================
-- Este script cria usuários de teste e dados iniciais

-- Nota: As senhas já estão pré-inseridas na tabela de roles
-- e o script cria usuários de teste com senhas predefinidas (para testes locais)

-- ===== INSERIR USUÁRIOS DE TESTE =====

-- Senha: Admin@123456 → Hash será gerado pelo auth.js
-- Para gerar hashes manualmente em testes, use:
-- const { hashPassword } = require('./server/utils/auth');
-- hashPassword('Admin@123456') → retorna algo como: 'salt:hash'

-- Usuário Admin
INSERT OR IGNORE INTO users (email, name, password_hash, role_id, is_active, first_access)
SELECT 'admin@example.com', 'Administrador', 
       '8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
       (SELECT id FROM roles WHERE name = 'admin'),
       1, 1;

-- Usuário Supervisor
INSERT OR IGNORE INTO users (email, name, password_hash, role_id, is_active, first_access)
SELECT 'supervisor@example.com', 'Supervisor do Time',
       '8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
       (SELECT id FROM roles WHERE name = 'supervisor'),
       1, 1;

-- Usuário Atendente 1
INSERT OR IGNORE INTO users (email, name, password_hash, role_id, is_active, first_access)
SELECT 'thomas@example.com', 'Thomas Gonçalves Farias',
       '8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
       (SELECT id FROM roles WHERE name = 'atendente'),
       1, 1;

-- Usuário Atendente 2
INSERT OR IGNORE INTO users (email, name, password_hash, role_id, is_active, first_access)
SELECT 'rafael@example.com', 'Rafael Inácio dos Santos de Moraes Silva',
       '8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
       (SELECT id FROM roles WHERE name = 'atendente'),
       1, 1;

-- Usuário Atendente 3
INSERT OR IGNORE INTO users (email, name, password_hash, role_id, is_active, first_access)
SELECT 'flux@example.com', 'Flux',
       '8e9c8d6f5a4b3c2d1e0f:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b',
       (SELECT id FROM roles WHERE name = 'atendente'),
       1, 1;

-- ===== Verificar Dados Inseridos =====
SELECT 
  u.id,
  u.email,
  u.name,
  r.name as role,
  u.is_active,
  u.first_access,
  u.created_at
FROM users u
JOIN roles r ON u.role_id = r.id
ORDER BY u.created_at DESC;

-- ===== Verificar Roles =====
SELECT * FROM roles;

-- ===== Limpar Dados (Se Necessário) =====
-- DELETE FROM users WHERE email LIKE '%@example.com';
-- DELETE FROM sessions;
-- DELETE FROM access_logs;
-- DELETE FROM mfa_settings;
