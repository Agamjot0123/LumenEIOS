import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
        id: 'limits', name: 'Limits', description: '', subject_id: 'sub-math',
        subject_name: 'Mathematics', topic: 'Calculus',
      },
    ];
    vi.spyOn(apiClient.assessments, 'targets').mockResolvedValue([
      { id: 'class-8a', name: '8-A', subjects: [{ id: 'sub-math', name: 'Mathematics' }] },
    ]);
    vi.spyOn(apiClient.knowledgeGraph, 'list').mockImplementation(async () => concepts.slice());
    vi.spyOn(apiClient.knowledgeGraph, 'relationships').mockResolvedValue([]);
    vi.spyOn(apiClient.knowledgeGraph, 'create').mockImplementation(async (body) => {
      const row = { id: 'chain', subject_name: 'Mathematics', ...body };
      concepts.push(row);
      return row;
    });

    renderPage('teacher');
    expect(await screen.findByRole('option', { name: 'Mathematics' })).toBeInTheDocument();
    expect(await screen.findByText('Limits')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Name'), 'Chain Rule');
    await user.type(screen.getByLabelText('Topic'), 'Calculus');
    await user.click(screen.getByRole('button', { name: 'Add concept' }));

    await waitFor(() => expect(screen.getAllByText('Chain Rule').length).toBeGreaterThan(0));
    expect(apiClient.knowledgeGraph.create).toHaveBeenCalledWith({
      name: 'Chain Rule',
      description: '',
      subject_id: 'sub-math',
      topic: 'Calculus',
    });
  });

  it('keeps the catalogue off the student account', async () => {
    renderPage('student');
    expect(await screen.findByRole('heading', { name: 'Access Restricted' })).toBeInTheDocument();
  });
});
