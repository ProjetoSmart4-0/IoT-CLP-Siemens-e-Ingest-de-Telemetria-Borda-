-- =============================================================================
-- SCRIPT DE INICIALIZAÇÃO DO BANCO DE DADOS (PostgreSQL + TimescaleDB)
-- PROJETO INTEGRADOR: APLICAÇÃO WEB INDÚSTRIA 4.0 - PLANTA N2 (SMART 4.0)
-- MÓDULO: GRUPO 3 (MES, BANCO DE DADOS, RASTREABILIDADE & OEE)
-- =============================================================================

-- Habilita extensão para geração de UUIDs se disponível
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -----------------------------------------------------------------------------
-- 1. TIPOS ENUMERADOS (ENUMS)
-- -----------------------------------------------------------------------------

CREATE TYPE user_role AS ENUM ('OPERATOR', 'ENGINEER', 'MANAGER', 'ADMIN');
CREATE TYPE order_status AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');
CREATE TYPE piece_status AS ENUM ('RAW_MATERIAL', 'IN_PROCESSING', 'INSPECTED_OK', 'INSPECTED_NOK', 'EXPEDITED');
CREATE TYPE machine_state AS ENUM ('STOPPED', 'RUNNING', 'PAUSED', 'EMERGENCY', 'ALARM');

-- -----------------------------------------------------------------------------
-- 2. TABELA DE USUÁRIOS E PERFIS DE ACESSO (IAM - GRUPO 5 & GRUPO 3)
-- -----------------------------------------------------------------------------

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'OPERATOR',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 3. TABELA DE ORDENS DE PRODUÇÃO (MES - GRUPO 3)
-- -----------------------------------------------------------------------------

CREATE TABLE production_orders (
    id VARCHAR(50) PRIMARY KEY, -- Ex: OP-2026-001
    product_type VARCHAR(100) NOT NULL,
    quantity_requested INT NOT NULL CHECK (quantity_requested > 0),
    quantity_produced INT NOT NULL DEFAULT 0 CHECK (quantity_produced >= 0),
    quantity_defective INT NOT NULL DEFAULT 0 CHECK (quantity_defective >= 0),
    status order_status NOT NULL DEFAULT 'PENDING',
    created_by UUID REFERENCES users(id),
    start_time TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 4. TABELA DE RASTREABILIDADE DE PEÇAS E VISÃO COMPUTACIONAL (GRUPO 2 & 3)
-- -----------------------------------------------------------------------------

CREATE TABLE pieces_traceability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qr_code VARCHAR(100) UNIQUE NOT NULL,
    order_id VARCHAR(50) REFERENCES production_orders(id) ON DELETE SET NULL,
    current_station VARCHAR(50) NOT NULL DEFAULT 'INSPECTION_ESTEIRA',
    inspection_result VARCHAR(20) DEFAULT 'PENDING', -- OK / NOK
    status piece_status NOT NULL DEFAULT 'RAW_MATERIAL',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 5. TABELA DE GESTÃO DE ESTOQUE E EXPEDIÇÃO (GRUPO 3)
-- -----------------------------------------------------------------------------

CREATE TABLE inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_code VARCHAR(50) UNIQUE NOT NULL,
    item_name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL, -- INSUMO, EMBALAGEM, PRODUTO_ACABADO
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    min_quantity INT NOT NULL DEFAULT 10,
    unit VARCHAR(20) NOT NULL DEFAULT 'UNIDADE',
    location VARCHAR(50) NOT NULL DEFAULT 'ESTAÇÃO_EXPEDIÇÃO',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- 6. TABELA DE TELEMETRIA EM TEMPO REAL E CLP (SÉRIES TEMPORAIS - GRUPO 1 & 3)
-- -----------------------------------------------------------------------------

CREATE TABLE telemetry_logs (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    machine_state machine_state NOT NULL DEFAULT 'STOPPED',
    belt_speed NUMERIC(5,2) DEFAULT 0.00, -- mm/s ou m/min
    start_button_pressed BOOLEAN DEFAULT FALSE,
    stop_button_pressed BOOLEAN DEFAULT FALSE,
    emergency_pressed BOOLEAN DEFAULT FALSE,
    reset_pressed BOOLEAN DEFAULT FALSE,
    raw_payload JSONB -- Armazena telemetria completa em formato JSON
);

-- Criação de índice por timestamp para alta performance em séries temporais
CREATE INDEX idx_telemetry_timestamp ON telemetry_logs (timestamp DESC);

-- -----------------------------------------------------------------------------
-- 7. TABELA DE ÍNDICES DE DESEMPENHO OEE (GRUPO 3)
-- -----------------------------------------------------------------------------

CREATE TABLE oee_metrics_hourly (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    availability NUMERIC(5,2) NOT NULL CHECK (availability BETWEEN 0 AND 100),
    performance NUMERIC(5,2) NOT NULL CHECK (performance BETWEEN 0 AND 100),
    quality NUMERIC(5,2) NOT NULL CHECK (quality BETWEEN 0 AND 100),
    oee_score NUMERIC(5,2) NOT NULL CHECK (oee_score BETWEEN 0 AND 100),
    total_produced INT NOT NULL DEFAULT 0,
    good_produced INT NOT NULL DEFAULT 0,
    defective_produced INT NOT NULL DEFAULT 0
);

-- -----------------------------------------------------------------------------
-- 8. CARGA INICIAL DE DADOS (SEEDS PARA TESTE DA TURMA)
-- -----------------------------------------------------------------------------

-- Inserção de Usuários de Teste (Senhas Hasheadas de Exemplo)
INSERT INTO users (sub_id, name, email, password_hash, role) VALUES
('usr_op_01', 'João Operador', 'joao.operador@ficticio.edu.br', '$2b$12$eXampLeHashOperatorKey12345678901234567890123456789', 'OPERATOR'),
('usr_eng_01', 'Carlos Engenheiro', 'carlos.eng@ficticio.edu.br', '$2b$12$eXampLeHashEngineerKey12345678901234567890123456789', 'ENGINEER'),
('usr_mngr_01', 'Ana Gestora', 'ana.gestora@ficticio.edu.br', '$2b$12$eXampLeHashManagerKey12345678901234567890123456789', 'MANAGER'),
('usr_admin_01', 'Admin Sistema', 'admin@ficticio.edu.br', '$2b$12$eXampLeHashAdminKey12345678901234567890123456789', 'ADMIN');

-- Inserção de Itens de Estoque Iniciais (Baseado no Gestor de Estoque da Planta N2)
INSERT INTO inventory_stock (item_code, item_name, category, quantity, min_quantity, location) VALUES
('MAT-RAW-01', 'Bloco de Alumínio Virgem (Peça Bruta)', 'INSUMO', 150, 20, 'ESTAÇÃO_ENTRADA'),
('MAT-RAW-02', 'Tampa Plástica de Fixação', 'INSUMO', 200, 30, 'ESTAÇÃO_ALIMENTADOR'),
('BOX-EXP-01', 'Caixa para Expedição SMART 4.0', 'EMBALAGEM', 80, 15, 'ESTAÇÃO_EXPEDIÇÃO'),
('PROD-FIN-01', 'Item Montado e Inspecionado OK', 'PROD_ACABADO', 12, 5, 'ESTAÇÃO_EXPEDIÇÃO');

-- Inserção de Ordem de Produção Inicial
INSERT INTO production_orders (id, product_type, quantity_requested, quantity_produced, status, created_by) VALUES
('OP-2026-001', 'Bloco Usinado SMART 4.0', 10, 2, 'IN_PROGRESS', (SELECT id FROM users WHERE sub_id = 'usr_mngr_01'));

-- Inserção de Rastreabilidade de Peças Iniciais
INSERT INTO pieces_traceability (qr_code, order_id, current_station, inspection_result, status) VALUES
('QR-SMART40-2026-001-A', 'OP-2026-001', 'ESTAÇÃO_EXPEDIÇÃO', 'OK', 'INSPECTED_OK'),
('QR-SMART40-2026-001-B', 'OP-2026-001', 'ESTAÇÃO_ROBÔ_UR', 'PENDING', 'IN_PROCESSING');

-- Inserção de Registro de OEE Inicial
INSERT INTO oee_metrics_hourly (availability, performance, quality, oee_score, total_produced, good_produced, defective_produced) VALUES
(95.00, 90.00, 98.00, 83.79, 50, 49, 1);

-- Inserção de Telemetria Inicial
INSERT INTO telemetry_logs (machine_state, belt_speed, start_button_pressed, raw_payload) VALUES
('RUNNING', 120.50, TRUE, '{"source": "CLP_SIEMENS_N2", "voltage": 220, "temperature_c": 38.5}');

-- =============================================================================
-- FIM DO SCRIPT DDL DE INICIALIZAÇÃO
-- =============================================================================
