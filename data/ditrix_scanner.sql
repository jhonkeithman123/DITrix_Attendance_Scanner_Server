-- Adminer 5.4.1 MariaDB 11.8.3-MariaDB-0+deb13u1 from Debian dump

SET NAMES utf8;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

SET NAMES utf8mb4;

CREATE DATABASE `ditrix_scanner` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_uca1400_ai_ci */;
USE `ditrix_scanner`;

DROP TABLE IF EXISTS `attendance`;
CREATE TABLE `attendance` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `session_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `status` varchar(255) NOT NULL,
  `timestamp` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `student_id` (`student_id`),
  KEY `attendance_ibfk_2` (`session_id`),
  CONSTRAINT `attendance_ibfk_1` FOREIGN KEY (`student_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `attendance_ibfk_2` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;


DROP TABLE IF EXISTS `capture_collaborators`;
CREATE TABLE `capture_collaborators` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `capture_id` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `role` varchar(50) NOT NULL,
  `joined_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `capture_collaborators_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


DROP TABLE IF EXISTS `capture_roster`;
CREATE TABLE `capture_roster` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `capture_id` varchar(64) NOT NULL,
  `student_id` varchar(64) NOT NULL,
  `student_name` varchar(255) NOT NULL,
  `present` tinyint(1) NOT NULL,
  `time_marked` datetime DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


DROP TABLE IF EXISTS `capture_session`;
CREATE TABLE `capture_session` (
  `id` varchar(64) NOT NULL,
  `user_id` int(11) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


DROP TABLE IF EXISTS `email_verifications`;
CREATE TABLE `email_verifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(255) NOT NULL,
  `code` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` int(11) NOT NULL,
  `created_at` datetime NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;


DROP TABLE IF EXISTS `sessions`;
CREATE TABLE `sessions` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `token` varchar(128) NOT NULL,
  `user_id` int(11) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;


DROP TABLE IF EXISTS `shared_captures`;
CREATE TABLE `shared_captures` (
  `capture_id` int(11) NOT NULL,
  `student_id` int(11) NOT NULL,
  `student_name` varchar(255) NOT NULL,
  `present` tinyint(4) NOT NULL,
  `time_marked` time NOT NULL,
  `status` varchar(255) NOT NULL,
  `owner_id` int(11) NOT NULL,
  `share_code` varchar(64) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  `id` varchar(64) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;


DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `avatar_url` varchar(2048) DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `verified` tinyint(1) DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci ROW_FORMAT=DYNAMIC;


-- 2025-12-13 14:53:06 UTC
