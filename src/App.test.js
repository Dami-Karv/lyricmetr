import { render, screen } from '@testing-library/react';
jest.mock('axios', () => ({ get: jest.fn() }));
import App from './App';

test('renders Lyricmetr header', () => {
  render(<App />);
  const linkElement = screen.getByText(/lyricmetr/i);
  expect(linkElement).toBeInTheDocument();
});
