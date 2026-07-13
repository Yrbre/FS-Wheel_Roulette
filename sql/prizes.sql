-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: localhost:3306
-- Generation Time: Jul 13, 2026 at 04:08 AM
-- Server version: 8.4.3
-- PHP Version: 8.1.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `wheel_app`
--

--
-- Dumping data for table `prizes`
--

INSERT INTO `prizes` (`id`, `name`, `stock`, `original_stock`, `status`, `created_at`) VALUES
(1, 'Doorprize 8', 10, 10, 'COMMON', '2026-07-07 07:24:08'),
(2, 'Doorprize 7', 10, 10, 'COMMON', '2026-07-07 07:24:08'),
(3, 'Doorprize 6', 10, 10, 'COMMON', '2026-07-07 07:24:08'),
(4, 'Doorprize 5', 4, 4, 'COMMON', '2026-07-07 07:24:08'),
(5, 'Doorprize 4', 4, 4, 'COMMON', '2026-07-07 07:24:08'),
(6, 'Doorprize 3', 4, 4, 'COMMON', '2026-07-07 07:24:08'),
(7, 'Doorprize 2', 4, 4, 'COMMON', '2026-07-07 07:24:08'),
(8, 'Doorprize 1', 4, 4, 'COMMON', '2026-07-07 07:24:08'),
(9, 'Grandprize 3', 1, 1, 'COMMON', '2026-07-07 07:24:08'),
(10, 'Grandprize 2', 1, 1, 'COMMON', '2026-07-07 07:24:08'),
(11, 'Grandprize 1', 1, 1, 'COMMON', '2026-07-07 07:24:08');
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
