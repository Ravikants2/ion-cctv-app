import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SortableTable } from './SortableTable';

describe('SortableTable', () => {
  it('sorts text and numeric columns in both directions', () => {
    render(
      <SortableTable>
        <thead><tr><th>Name</th><th>Count</th></tr></thead>
        <tbody>
          <tr><td>Venue 10</td><td>2</td></tr>
          <tr><td>Venue 2</td><td>12</td></tr>
        </tbody>
      </SortableTable>
    );
    const table = screen.getByRole('table');
    const getNames = () => within(table).getAllByRole('row').slice(1).map(row => within(row).getAllByRole('cell')[0].textContent);

    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(getNames()).toEqual(['Venue 2', 'Venue 10']);

    fireEvent.click(screen.getByRole('button', { name: /Count/ }));
    expect(getNames()).toEqual(['Venue 10', 'Venue 2']);
  });
});
