CREATE DATABASE IF NOT EXISTS basc69_groups;
USE basc69_groups;

-- Table to store OAuth tokens for users
CREATE TABLE IF NOT EXISTS oauth_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wca_user_id INT NOT NULL UNIQUE,
    wca_id VARCHAR(10),
    name VARCHAR(255),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_wca_user_id (wca_user_id)
);

-- Table to store group selections
CREATE TABLE IF NOT EXISTS group_selections (
    id INT AUTO_INCREMENT PRIMARY KEY,
    registrant_id INT NOT NULL,
    wca_user_id INT NOT NULL,
    activity_id INT NOT NULL,
    activity_name VARCHAR(255) NOT NULL,
    group_number INT NOT NULL,
    accepted TINYINT(1) NOT NULL DEFAULT 0,
    selected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_selection (registrant_id, activity_id),
    INDEX idx_activity (activity_id),
    INDEX idx_registrant (registrant_id),
    FOREIGN KEY (wca_user_id) REFERENCES oauth_tokens(wca_user_id) ON DELETE CASCADE
);

-- Table to track WCIF write history
CREATE TABLE IF NOT EXISTS wcif_writes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    delegate_wca_user_id INT NOT NULL,
    delegate_name VARCHAR(255),
    write_status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
    error_message TEXT,
    groups_written INT DEFAULT 0,
    written_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (delegate_wca_user_id) REFERENCES oauth_tokens(wca_user_id)
);
