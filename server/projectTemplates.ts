export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  folders: string[];
  files: { path: string; content: string }[];
}

export const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  academic: {
    id: "academic",
    name: "Academic Research & Thesis",
    category: "Academic",
    icon: "GraduationCap",
    description: "Structured workflow for papers, thesis, literature review, datasets, and experiment plots.",
    folders: [
      "data/raw",
      "data/processed",
      "plots",
      "notebooks",
      "papers",
      "drafts",
    ],
    files: [
      {
        path: "README.md",
        content: `# Academic Research Project

## Abstract
Briefly summarize your research problem, methodology, and primary hypothesis.

## Objectives
- [ ] Literature review & background survey
- [ ] Data collection / experiment design
- [ ] Model training / data processing
- [ ] Evaluation & visualization (plots)
- [ ] Draft manuscript for submission

## Repository Structure
- \`data/raw/\`: Immutable raw experimental datasets.
- \`data/processed/\`: Cleaned, normalized datasets.
- \`plots/\`: Generated figures, charts, and visualizations for the paper.
- \`notebooks/\`: Interactive notebooks or data analysis scripts.
- \`papers/\`: Reference PDFs and related literature.
- \`drafts/\`: Paper sections, manuscripts, and conference submissions.
- \`references.bib\`: BibTeX citations.
`,
      },
      {
        path: "notes.md",
        content: `# Research Notes & Logbook

## Experiment Log
### Date: ${new Date().toISOString().split("T")[0]}
- **Hypothesis:** 
- **Setup:** 
- **Observation:** 
- **Next Steps:** 

---

## Literature Findings
- Key insights and papers reviewed:
`,
      },
      {
        path: "references.bib",
        content: `@article{sample2026,
  author    = {Author, A. and Researcher, B.},
  title     = {Advances in Modern Computational Systems},
  journal   = {Journal of Research},
  year      = {2026},
  volume    = {1},
  pages     = {100--120}
}
`,
      },
      {
        path: "drafts/outline.md",
        content: `# Manuscript Outline

1. **Introduction**
   - Motivation and problem statement
   - Contributions of this work
2. **Related Work**
   - Survey of existing literature
   - Limitations of previous approaches
3. **Methodology**
   - Theoretical framework
   - Algorithmic design / pipeline
4. **Experimental Results**
   - Dataset descriptions
   - Performance metrics and comparisons
5. **Discussion & Conclusion**
   - Key findings
   - Future directions
`,
      },
      {
        path: "notebooks/analysis.py",
        content: `"""
Sample Data Analysis and Plot Generator
Save output plots directly into the plots/ folder for your paper.
"""

import os
# import matplotlib.pyplot as plt
# import numpy as np

def main():
    os.makedirs("plots", exist_ok=True)
    print("Academic analysis pipeline initialized.")
    # Example:
    # fig, ax = plt.subplots()
    # plt.savefig("plots/figure1_results.png", dpi=300)

if __name__ == "__main__":
    main()
`,
      },
    ],
  },

  datascience: {
    id: "datascience",
    name: "Data Science & Machine Learning",
    category: "AI & Data",
    icon: "BarChart3",
    description: "Production-ready structure for ML experiments, datasets, trained checkpoints, and evaluation.",
    folders: [
      "data",
      "models",
      "plots",
      "notebooks",
      "src",
      "configs",
    ],
    files: [
      {
        path: "README.md",
        content: `# Data Science & ML Project

## Overview
Problem description, target metrics, baseline results, and architecture notes.

## Directory Layout
- \`data/\`: Raw and feature-engineered datasets.
- \`models/\`: Saved checkpoints, weights, and serialized pipelines.
- \`plots/\`: Loss curves, confusion matrices, ROC curves.
- \`notebooks/\`: Exploratory data analysis (EDA).
- \`src/\`: Reusable modules (dataset loaders, training loops, evaluation).
- \`configs/\`: Hyperparameters and configuration YAML/JSON files.
`,
      },
      {
        path: "notes.md",
        content: `# ML Experiment Tracker

| Exp ID | Model Type | Parameters | Train Loss | Val Metric | Notes |
|--------|------------|------------|------------|------------|-------|
| 001    | Baseline   | default    | -          | -          | Initial baseline |
`,
      },
      {
        path: "configs/config.json",
        content: `{
  "experiment_name": "run_01",
  "seed": 42,
  "batch_size": 32,
  "learning_rate": 0.001,
  "epochs": 50,
  "device": "cuda"
}
`,
      },
      {
        path: "src/main.py",
        content: `import json

def run():
    print("Loading config from configs/config.json...")
    with open("configs/config.json", "r") as f:
        cfg = json.load(f)
    print(f"Starting training run: {cfg.get('experiment_name')}")

if __name__ == "__main__":
    run()
`,
      },
      {
        path: "requirements.txt",
        content: `numpy
pandas
matplotlib
scikit-learn
torch
`,
      },
    ],
  },

  software: {
    id: "software",
    name: "Software & Scripting",
    category: "Engineering",
    icon: "Code2",
    description: "Standard software project layout with source, tests, documentation, and scripts.",
    folders: [
      "src",
      "docs",
      "tests",
      "scripts",
      "assets",
    ],
    files: [
      {
        path: "README.md",
        content: `# Project Name

## Description
A concise summary of what this software does and how to run it.

## Quick Start
\`\`\`bash
# Install dependencies
npm install  # or: pip install -r requirements.txt

# Run
npm start
\`\`\`

## Architecture
- \`src/\`: Application source code.
- \`tests/\`: Unit and integration tests.
- \`docs/\`: Design specifications and API docs.
- \`scripts/\`: Automation and deployment scripts.
`,
      },
      {
        path: "notes.md",
        content: `# Development Notes & Roadmap

## Active Tasks
- [ ] Setup initial project scaffolding
- [ ] Core architecture implementation
- [ ] Unit testing
- [ ] Deployment to server
`,
      },
      {
        path: ".env.example",
        content: `# Environment configuration
PORT=8080
API_KEY=your_key_here
NODE_ENV=development
`,
      },
    ],
  },

  book: {
    id: "book",
    name: "Book & Longform Writing",
    category: "Writing",
    icon: "BookOpen",
    description: "Creative writing environment with chapter drafts, character sheets, and research notes.",
    folders: [
      "chapters",
      "research",
      "characters",
      "outlines",
      "drafts",
    ],
    files: [
      {
        path: "README.md",
        content: `# Book Title

**Logline:** One sentence summary of the book.  
**Genre:** Fiction / Non-Fiction  
**Target Word Count:** 60,000 words  

## Structure
- \`outlines/\`: Master plot and chapter breakdown.
- \`chapters/\`: Polished chapter manuscripts.
- \`drafts/\`: In-progress writing passes.
- \`characters/\`: Character bios, motivations, and arcs.
- \`research/\`: Background materials, worldbuilding, and references.
`,
      },
      {
        path: "outlines/master_outline.md",
        content: `# Master Outline

## Act I
- Chapter 1: Hook and Ordinary World
- Chapter 2: Inciting Incident

## Act II
- Chapter 3: Rising Stakes
- Chapter 4: Midpoint Climax

## Act III
- Chapter 5: Climax & Resolution
`,
      },
      {
        path: "chapters/chapter_01.md",
        content: `# Chapter 1

Begin writing here...
`,
      },
      {
        path: "notes.md",
        content: `# Ideas & Worldbuilding

## Core Themes
- 

## Braindump
- 
`,
      },
    ],
  },

  course: {
    id: "course",
    name: "Course & Lecture Study",
    category: "Education",
    icon: "Library",
    description: "Organized notes for university courses, certifications, lectures, and exam preparation.",
    folders: [
      "lectures",
      "assignments",
      "readings",
      "exam_prep",
    ],
    files: [
      {
        path: "README.md",
        content: `# Course Title

- **Instructor:** 
- **Semester / Term:** 
- **Schedule:** 
- **Grading:** Assignments 40%, Midterm 20%, Final 40%

## Folders
- \`lectures/\`: Lecture notes and transcriptions.
- \`assignments/\`: Problem sets, code, and submissions.
- \`readings/\`: Summaries of assigned textbook chapters or papers.
- \`exam_prep/\`: Formula sheets, flashcards, and practice tests.
`,
      },
      {
        path: "notes.md",
        content: `# Key Formulas & Cheat Sheet

## Important Concepts
- 

## Formulas
$$ E = mc^2 $$
`,
      },
      {
        path: "lectures/lecture_01.md",
        content: `# Lecture 1: Introduction

**Date:** ${new Date().toISOString().split("T")[0]}  
**Topic:** Foundations and Overview  

## Notes
- 
`,
      },
    ],
  },

  blank: {
    id: "blank",
    name: "Custom / Blank Project",
    category: "General",
    icon: "FolderPlus",
    description: "Start clean with custom subdirectories of your choice.",
    folders: [],
    files: [
      {
        path: "README.md",
        content: `# Project Name

Project description and notes.
`,
      },
      {
        path: "notes.md",
        content: `# Notes

Start typing your notes here.
`,
      },
    ],
  },
};

const TEMPLATE_ALIASES: Record<string, string> = {
  academic_research: "academic",
  data_science: "datascience",
  software_dev: "software",
  book_writing: "book",
  course_prep: "course",
};

export function resolveTemplate(templateId?: string): ProjectTemplate {
  if (!templateId) return PROJECT_TEMPLATES.academic;
  const raw = templateId.toLowerCase().trim();
  if (PROJECT_TEMPLATES[raw]) return PROJECT_TEMPLATES[raw];
  if (TEMPLATE_ALIASES[raw] && PROJECT_TEMPLATES[TEMPLATE_ALIASES[raw]]) {
    return PROJECT_TEMPLATES[TEMPLATE_ALIASES[raw]];
  }
  const norm = raw.replace(/[-_\s]/g, "");
  if (norm.includes("academic") || norm.includes("thesis") || norm.includes("research")) {
    return PROJECT_TEMPLATES.academic;
  }
  if (norm.includes("data") || norm.includes("ml") || norm.includes("ai")) {
    return PROJECT_TEMPLATES.datascience;
  }
  if (norm.includes("soft") || norm.includes("dev") || norm.includes("code")) {
    return PROJECT_TEMPLATES.software;
  }
  if (norm.includes("book") || norm.includes("novel") || norm.includes("write")) {
    return PROJECT_TEMPLATES.book;
  }
  if (norm.includes("course") || norm.includes("class") || norm.includes("lecture")) {
    return PROJECT_TEMPLATES.course;
  }
  return PROJECT_TEMPLATES.blank;
}
