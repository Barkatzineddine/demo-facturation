import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CommandPalette, type Command } from '../../src/shared/ui/CommandPalette';

const labels = { title: 'Recherche rapide', placeholder: 'Nom, code…', empty: 'Aucun résultat', open: 'Rechercher' };

function setup() {
  const run = { today: vi.fn(), lea: vi.fn(), ines: vi.fn() };
  const commands: Command[] = [
    { id: 'today', group: 'Actions', label: "Aller à aujourd'hui", run: run.today },
    { id: 'lea', group: 'Rendez-vous', label: 'Léa Martin · mar. 14:00', hint: 'MC-K7P2Q', keywords: '06 11 22 33 44', run: run.lea },
    { id: 'ines', group: 'Rendez-vous', label: 'Inès Haddad · mer. 10:30', hint: 'MC-ZZ8RT', run: run.ines },
  ];
  render(<CommandPalette commands={commands} labels={labels} />);
  return { run, user: userEvent.setup() };
}

describe('CommandPalette', () => {
  it('opens with Ctrl+K and runs the highlighted result with Enter', async () => {
    const { run, user } = setup();
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox');
    expect(input).toHaveFocus();
    await user.type(input, 'lea');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Léa Martin');
    await user.keyboard('{Enter}');
    expect(run.lea).toHaveBeenCalledOnce();
  });

  it('searches codes and phone numbers, ignoring accents', async () => {
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: /Rechercher/ }));
    await user.type(screen.getByRole('combobox'), 'zz8r');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(screen.getByRole('combobox'));
    await user.type(screen.getByRole('combobox'), 'ines');
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Inès Haddad');
  });

  it('moves the selection with the arrow keys (aria-activedescendant)', async () => {
    const { run, user } = setup();
    await user.keyboard('{Control>}k{/Control}');
    const input = screen.getByRole('combobox');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    const selected = screen.getAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true');
    expect(input).toHaveAttribute('aria-activedescendant', selected?.id);
    await user.keyboard('{Enter}');
    expect(run.ines).toHaveBeenCalledOnce();
  });

  it('says so when nothing matches', async () => {
    const { user } = setup();
    await user.keyboard('{Control>}k{/Control}');
    await user.type(screen.getByRole('combobox'), 'qwxz');
    expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
  });
});
