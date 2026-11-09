import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../../../context/AuthContext';
import { initialUsers } from '../../../data/seedData';
import { ApiError } from '../../../lib/apiClient';
import type { Role } from '../../../types';
import { CatalogueServiceProvider } from '../api/CatalogueServiceContext';
import type { CurriculumCatalogueService } from '../api/catalogueService';
import { createHttpCatalogueService } from '../api/httpCatalogueService';
import { createMockCatalogueService } from '../mocks/mockCatalogueService';
import { CatalogueCombinationPage } from '../pages/CatalogueCombinationPage';
import { CatalogueDashboard } from '../pages/CatalogueDashboard';

function signInAs(role: Role) {
  const user = initialUsers.find((u) => u.role === role)!;
  localStorage.setItem('lumeneios_auth_user', JSON.stringify(user));
  return user;
}

function mockService(role: Role, overrides: Partial<Parameters<typeof createMockCatalogueService>[0]> = {}) {
  const user = initialUsers.find((u) => u.role === role)!;
  return createMockCatalogueService({ getActor: () => ({ name: user.name, role }), latencyMs: 0, store: new Map(), ...overrides });
}

function renderCatalogue(path: string, service: CurriculumCatalogueService) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CatalogueServiceProvider service={service}>
          <Routes>
            <Route path="/curriculum/catalogue" element={<CatalogueDashboard />} />
            <Route path="/curriculum/catalogue/:grade/:subject" element={<CatalogueCombinationPage />} />
          </Routes>
        </CatalogueServiceProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('Screen 1: catalogue dashboard', () => {
  it('renders purpose, prototype scope, data-source disclosure and permission status', async () => {
    signInAs('principal');
    renderCatalogue('/curriculum/catalogue', mockService('principal'));
    expect(screen.getByRole('heading', { name: 'Curriculum Catalogue' })).toBeInTheDocument();
    expect(screen.getByText(/Prototype scope: Classes VI–VIII · Mathematics and Science/)).toBeInTheDocument();
    expect(await screen.findByTestId('data-source-banner')).toHaveTextContent(/research snapshot \(mock\)/i);
    expect(screen.getByTestId('data-source-banner')).toHaveTextContent(/none published/i);
    expect(screen.getByTestId('permission-status')).toHaveTextContent(/can view and review/i);
    expect(screen.getByText('Resources tracked')).toBeInTheDocument();
    expect(screen.getByText('Pending review')).toBeInTheDocument();
  });

  it('lists all six class–subject combinations and the selectors update the summary', async () => {
    signInAs('teacher');
    renderCatalogue('/curriculum/catalogue', mockService('teacher'));
    for (const g of [6, 7, 8]) {
      for (const s of ['mathematics', 'science']) {
        expect(await screen.findByTestId(`combo-${g}-${s}`)).toHaveAttribute('href', `/curriculum/catalogue/${g}/${s}`);
      }
    }
    expect(screen.getByTestId('permission-status')).toHaveTextContent(/view only/i);

    const user = userEvent.setup();
    await user.click(screen.getByRole('radio', { name: 'Class VIII' }));
    await user.click(screen.getByRole('radio', { name: 'Science' }));
    expect(screen.getByRole('heading', { name: /Class VIII Science: summary/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Open Class VIII Science/ }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Class VIII Science' })).toBeInTheDocument();
  });

  it.each([
    [6, 'mathematics', 'Class VI Mathematics'],
    [6, 'science', 'Class VI Science'],
    [7, 'mathematics', 'Class VII Mathematics'],
    [7, 'science', 'Class VII Science'],
    [8, 'mathematics', 'Class VIII Mathematics'],
    [8, 'science', 'Class VIII Science'],
  ])('opens combination %s/%s', async (g, s, heading) => {
    signInAs('admin');
    renderCatalogue(`/curriculum/catalogue/${g}/${s}`, mockService('admin'));
    expect(screen.getByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Syllabus availability' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Learning-outcome availability' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Textbook editions' })).toBeInTheDocument();
  });

  it('shows an unauthorized state for students', () => {
    signInAs('student');
    renderCatalogue('/curriculum/catalogue', mockService('student'));
    expect(screen.getByTestId('state-unauthorized')).toBeInTheDocument();
  });
});

describe('Screen 2 and 6: curriculum overview, placeholders and languages', () => {
  it('shows textbook edition information, syllabus placeholders and language availability', async () => {
    signInAs('principal');
    renderCatalogue('/curriculum/catalogue/6/mathematics', mockService('principal'));

    const edition = await screen.findByTestId('edition-VI-VIII-6-MATH-EDITION-fegp1');
    expect(edition).toHaveTextContent('Ganita Prakash');
    expect(edition).toHaveTextContent('First Edition August 2024 Shravna 1946');
    expect(edition).toHaveTextContent('Reprint 2026-27');
    expect(within(edition).getByText('Verified')).toBeInTheDocument();

    const currentSyllabus = screen.getByTestId('resource-VI-VIII-6-MATH-SYLLABUS-en-CURRENT_NEW_TEXTBOOKS');
    expect(currentSyllabus).toHaveTextContent('No syllabus found in checked NCERT channels');
    expect(within(currentSyllabus).getByText('Placeholder')).toBeInTheDocument();
    expect(currentSyllabus).not.toHaveTextContent('Ganita Prakash');

    const matrix = screen.getByTestId('language-matrix');
    expect(within(matrix).getByTestId('lang-syllabus-current-hi')).toHaveTextContent('Placeholder');
    expect(within(matrix).getByTestId('lang-textbook-en')).toHaveTextContent('Verified');
    expect(within(matrix).getByTestId('lang-textbook-hi')).toHaveTextContent('Partially verified');
    expect(within(matrix).getByTestId('lang-framework-ur')).toHaveTextContent('Unverified');
    expect(screen.getByTestId('rights-note')).toHaveTextContent(/metadata only/i);
  });

  it('renders the explicit Urdu Part II gap as a placeholder without invented details', async () => {
    signInAs('principal');
    renderCatalogue('/curriculum/catalogue/7/mathematics', mockService('principal'));
    const gap = await screen.findByTestId('edition-VI-VIII-7-MATH-EDITION-MISSING-ur-PART-II');
    expect(gap).toHaveTextContent('Expected part not identified on the official portal');
    expect(within(gap).getByText('Placeholder')).toBeInTheDocument();
    expect(within(screen.getByTestId('language-matrix')).getByTestId('lang-textbook-ur')).toHaveTextContent('1 gap');
  });
});

describe('Screen 3 and 4: chapter explorer and evidence panel', () => {
  it('lists only source-checked chapters with locators and opens the evidence panel', async () => {
    signInAs('teacher');
    const user = userEvent.setup();
    renderCatalogue('/curriculum/catalogue/6/mathematics?view=explorer', mockService('teacher'));

    expect(await screen.findByTestId('explorer-textbook-title')).toHaveTextContent('Ganita Prakash');
    expect(screen.getByTestId('explorer-completeness')).toHaveTextContent(/no chapters or topics are inferred/i);
    const chapter = screen.getByTestId('chapter-CH-fegp104');
    expect(chapter).toHaveTextContent('Data Handling and Presentation');
    expect(chapter).toHaveTextContent('Bar Graphs');
    expect(chapter).toHaveTextContent('Chapter PDF p12; printed p85; section 4.3');
    expect(chapter).toHaveTextContent('None verified');

    await user.click(within(chapter).getByRole('button', { name: 'View evidence: section 4.3' }));
    const dialog = screen.getByRole('dialog', { name: 'Source evidence' });
    expect(dialog).toHaveTextContent('https://ncert.nic.in/textbook/pdf/fegp104.pdf');
    expect(dialog).toHaveTextContent('First Edition August 2024 Shravna 1946');
    expect(dialog).toHaveTextContent('SOURCE_VERIFIED_FOR_HEADING_AND_SECTION_MEMBERSHIP');
    expect(within(dialog).getByRole('link', { name: /fegp104\.pdf/ })).toHaveAttribute('rel', 'noopener noreferrer');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Source evidence' })).not.toBeInTheDocument();
  });

  it('shows a placeholder for editions with no checked chapters', async () => {
    signInAs('teacher');
    const user = userEvent.setup();
    renderCatalogue('/curriculum/catalogue/6/mathematics?view=explorer', mockService('teacher'));
    await screen.findByTestId('explorer-textbook-title');
    await user.click(screen.getByRole('button', { name: /गणित प्रकाश/ }));
    expect(screen.getByText('No chapters have been source-checked for this edition')).toBeInTheDocument();
  });
});

describe('Screen 5: mapping review', () => {
  it('presents candidates as unapproved and hides review actions from teachers', async () => {
    signInAs('teacher');
    renderCatalogue('/curriculum/catalogue/8/science?view=review', mockService('teacher'));
    const card = await screen.findByTestId('mapping-XW-hecu105-S5.4.1');
    expect(card).toHaveTextContent('AI-suggested candidate. Not approved.');
    expect(within(card).getAllByText('Awaiting review').length).toBeGreaterThanOrEqual(2);
    expect(within(card).queryByText('Approved')).not.toBeInTheDocument();
    expect(within(card).queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
    expect(card).toHaveTextContent(/View only/);
    expect(card).toHaveTextContent('differentiation using properties and functions');
    expect(card).toHaveTextContent(/research label only/i);
  });

  it('records a decision through the service, requiring a rationale', async () => {
    signInAs('principal');
    const service = mockService('principal');
    const spy = vi.spyOn(service, 'submitReview');
    const user = userEvent.setup();
    renderCatalogue('/curriculum/catalogue/6/mathematics?view=review', service);

    const card = await screen.findByTestId('mapping-XW-fegp104-S4.3');
    await user.click(within(card).getByRole('button', { name: 'Request revision' }));
    const modal = screen.getByRole('dialog', { name: /Request revision candidate mapping/ });
    await user.click(within(modal).getByRole('button', { name: 'Record decision' }));
    expect(within(modal).getByRole('alert')).toHaveTextContent(/rationale/i);
    expect(spy).not.toHaveBeenCalled();

    await user.type(within(modal).getByLabelText(/Decision rationale/), 'Scope of outcome is broader than bar graphs.');
    await user.click(within(modal).getByRole('button', { name: 'Record decision' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: /candidate mapping/ })).not.toBeInTheDocument());
    expect(spy).toHaveBeenCalledWith('XW-fegp104-S4.3', {
      decision: 'REQUEST_REVISION',
      rationale: 'Scope of outcome is broader than bar graphs.',
    });
    const updated = screen.getByTestId('mapping-XW-fegp104-S4.3');
    expect(within(updated).getByText('Revision requested')).toBeInTheDocument();
    expect(updated).toHaveTextContent('Scope of outcome is broader than bar graphs.');
    expect(screen.getByTestId('review-announcement')).toHaveTextContent(/recorded/);
  });

  it('surfaces a backend authorization failure inside the decision dialog', async () => {
    signInAs('principal');
    const service = mockService('principal');
    vi.spyOn(service, 'submitReview').mockRejectedValue(new ApiError(403, 'Reviewer membership required.'));
    const user = userEvent.setup();
    renderCatalogue('/curriculum/catalogue/6/mathematics?view=review', service);
    const card = await screen.findByTestId('mapping-XW-fegp104-S4.3');
    await user.click(within(card).getByRole('button', { name: 'Approve' }));
    const modal = screen.getByRole('dialog', { name: /Approve candidate mapping/ });
    await user.type(within(modal).getByLabelText(/Decision rationale/), 'Both endpoints checked.');
    await user.click(within(modal).getByRole('button', { name: 'Record decision' }));
    expect(await within(modal).findByRole('alert')).toHaveTextContent('Not permitted: Reviewer membership required.');
    expect(within(screen.getByTestId('mapping-XW-fegp104-S4.3')).queryByText('Approved')).not.toBeInTheDocument();
  });
});

describe('API loading, failure and contract-pending states', () => {
  it('shows a loading state then an error with retry', async () => {
    signInAs('admin');
    let fail = true;
    const base = mockService('admin');
    const service: CurriculumCatalogueService = {
      ...base,
      getDashboard: () => (fail ? Promise.reject(new ApiError(0, 'offline')) : base.getDashboard()),
    };
    const user = userEvent.setup();
    renderCatalogue('/curriculum/catalogue', service);
    expect(screen.getByRole('status')).toHaveTextContent(/Loading/);
    expect(await screen.findByTestId('state-error')).toHaveTextContent(/Could not reach the LumenEIOS backend/);
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('combo-6-mathematics')).toBeInTheDocument();
  });

  it('API mode shows no-release empty state and contract-pending views instead of fabricated data', async () => {
    signInAs('admin');
    const request = vi.fn().mockResolvedValue({ release_id: null, items: [], completeness: 'UNAVAILABLE', reason: 'NO_PUBLISHED_RELEASE' });
    const service = createHttpCatalogueService(request as any);
    const { unmount } = renderCatalogue('/curriculum/catalogue', service);
    expect(await screen.findByTestId('state-empty')).toHaveTextContent(/no published release/i);
    expect(screen.getByTestId('data-source-banner')).toHaveTextContent(/backend API/);
    unmount();

    renderCatalogue('/curriculum/catalogue/6/science', service);
    expect(await screen.findByTestId('state-contract-pending')).toBeInTheDocument();
  });

  it('maps a backend 403 to the unauthorized state', async () => {
    signInAs('admin');
    const base = mockService('admin');
    renderCatalogue('/curriculum/catalogue/6/science', {
      ...base,
      getCombination: () => Promise.reject(new ApiError(403, 'Forbidden for this school')),
    });
    expect(await screen.findByTestId('state-unauthorized')).toHaveTextContent('Forbidden for this school');
  });
});
