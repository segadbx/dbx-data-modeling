# PRD: AI-Automated Dimensional Modeling (Gold Layer)

## 1. Executive Summary
This Product Requirements Document (PRD) outlines the requirements for an AI-driven Proof of Concept (POC) designed to automate the creation of dimensional models (the "gold layer") within a medallion data architecture. The system will leverage AI agents to analyze existing data in upstream layers and automatically propose and refine dimensional models, significantly reducing the manual bottleneck of traditional data modeling.

## 2. Problem Statement
Data is currently ingested efficiently from source systems into the bronze and silver layers using an automated internal framework. However, creating the semantic and dimensional models for the gold layer is highly manual and slow. The current approach to data modeling is thorough regarding governance and standard normalization but lacks the speed required for rapid dimensional modeling.

## 3. Objectives & Core Functionality
*   **Automated Model Proposal:** An AI agent must be able to inspect newly arrived data in the silver or bronze layer and automatically propose a dimensional model (e.g., generating fact and dimension tables).
*   **Context-Aware Design:** The agent must analyze existing semantic models in the gold layer to reuse available dimensions (e.g., date or employee dimensions) rather than creating redundant structures.
*   **Data-Driven Methodology:** The solution will explicitly design models based on the data physically present in the underlying tables, intentionally bypassing traditional methodologies that rely entirely on upfront business requirements gathering.
*   **Human-in-the-Loop Refinement:** The system must feature an interactive feedback loop. A user will review the agent's proposed model and provide conversational prompts (e.g., requesting different column aggregations), and the agent will iteratively update the design based on that feedback.
*   **Automated Code Generation:** Once a model design is finalized and approved, the system will hand off the design to a secondary agent responsible for writing the actual pipeline code (e.g., handling Type 2 dimensions) required to move and transform data from silver to gold.

## 4. Dependencies & Prerequisites
*   **Robust Metadata:** AI agents require deep contextual awareness to understand the underlying data accurately. The primary data catalog must be populated with comprehensive table descriptions and column-level comments.
*   **Data Governance Pre-work:** Because existing metadata is largely incomplete, selected datasets must be manually scrubbed and properly documented prior to agent deployment.
*   **Ingestion Framework Enhancements:** Future iterations of the automated ingestion framework must be updated to automatically extract "create table" metadata directly from source systems during ingestion, ensuring technical metadata flows seamlessly into the bronze and silver layers.

## 5. Phased Implementation Plan
*   **Phase 0: Synthetic Prototype:** Develop an initial sketch and pipeline workflow using synthetically generated data in an isolated, external environment. This bypasses immediate security and access constraints while demonstrating the core agent interaction.
*   **Phase 1: Basic Fact Table Generation:** Apply the agent to a clean, fully documented subset of real organizational data (such as HR or asset management data). The goal is to have the agent successfully generate a rudimentary fact table and successfully test the human-agent iteration loop.
*   **Phase 2: Pipeline Code Generation:** Integrate the secondary agent to automatically develop the transformation pipelines and physical table structures based on the finalized Phase 1 design.
