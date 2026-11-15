import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { initialUsers } from '../data/seedData';
import { apiClient } from '../lib/apiClient';
import { KnowledgeComponentsPage } from '../pages/teacher/KnowledgeComponents';
import { signInAs } from './signIn';

afterEach(() => {
  vi.restoreAllMocks();
});

function renderPage(role: 'teacher' | 'student') {
  signInAs(initialUsers.find((user) => user.role === role));
  return render(
    <MemoryRouter>
      <AuthProvider>
        <KnowledgeComponentsPage />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('teacher knowledge components', () => {
  it('lets a teacher add a concept for a subject', async () => {
    const concepts = [
      {
        id: 'limits', name: 'Limits', description: 'The value a function approaches.',
        subject_id: 'sub-math', subject_name: 'Mathematics', topic: 'Calculus',
      },
    ];
    const links: Array<{ id: string; source_id: string; target_id: string; relationship: 'PREREQUISITE_OF' }> = [];
    vi.spyOn(apiClient.assessments, 'targets').mockResolvedValue([
      { id: 'class-8a', name: '8-A', subjects: [{ id: 'sub-math', name: 'Mathematics' }] },
    ]);
    vi.spyOn(apiClient.knowledgeGraph, 'list').mockImplementation(async () => concepts.slice());
    vi.spyOn(apiClient.knowledgeGraph, 'relationships').mockImplementation(async () => links.slice());
    vi.spyOn(apiClient.knowledgeGraph, 'create').mockImplementation(async (body) => {
      const row = { id: body.name.toLowerCase().replace(/\s+/g, '-'), subject_name: 'Mathematics', ...body };
      concepts.push(row);
      return row;
    });
    vi.spyOn(apiClient.knowledgeGraph, 'demoPreview').mockResolvedValue({
      student_name: 'Aarav',
      student_email: 'student@lumeneios.demo',
      subject_name: 'Mathematics',
      assessment_id: 'demo-kc-sub-math',
      title: 'Sample paper: number sense',
      class_name: 'Class 8-A',
      extracted_text: 'Q1. sample',
      evaluated: false,
      total_marks_obtained: null,
      max_possible_marks: null,
      percentage: null,
      graph: { nodes: [], edges: [], insights: [] },
    });
    vi.spyOn(apiClient.knowledgeGraph, 'link').mockImplementation(async (body) => {
      const row = { id: 'edge-1', ...body };
      links.push(row);
      return row;
    });

    renderPage('teacher');
    expect(await screen.findByRole('option', { name: 'Mathematics' })).toBeInTheDocument();
    expect((await screen.findAllByRole('option', { name: 'Chain Rule' })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('option', { name: 'Differentiation' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('option', { name: 'Calculus' })).toBeInTheDocument();
    expect(await screen.findByText(/Limits is a prerequisite of Chain Rule/)).toBeInTheDocument();
    expect(apiClient.knowledgeGraph.create).toHaveBeenCalledWith({
      name: 'Chain Rule',
      description: 'Differentiate a composition of functions.',
      subject_id: 'sub-math',
      topic: 'Calculus',
    });
  });

  it('keeps the catalogue off the student account', async () => {
    renderPage('student');
    expect(await screen.findByRole('heading', { name: 'Access Restricted' })).toBeInTheDocument();
  });
});
