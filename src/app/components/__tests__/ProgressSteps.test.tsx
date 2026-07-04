import { render, screen } from '@testing-library/react-native';

import { ProgressSteps } from '../ProgressSteps';

const steps = [
  { key: 'video', label: 'Video', detail: 'No video', state: 'active' },
  { key: 'track', label: 'Tracking', detail: 'Not started', state: 'todo' },
  {
    key: 'distance',
    label: 'Distance',
    detail: 'Not estimated',
    state: 'todo',
  },
] as const;

describe('ProgressSteps', () => {
  it('renders labels and verbatim detail text', () => {
    render(<ProgressSteps steps={steps} />);
    expect(screen.getByText('Video')).toBeTruthy();
    expect(screen.getByText('No video')).toBeTruthy();
    expect(screen.getByText('Not started')).toBeTruthy();
    expect(screen.getByText('Not estimated')).toBeTruthy();
  });

  it('renders all node state variants', () => {
    render(
      <ProgressSteps
        steps={[
          { key: 'a', label: 'Done step', state: 'done' },
          { key: 'b', label: 'Active step', state: 'active' },
          { key: 'c', label: 'Todo step', state: 'todo' },
        ]}
      />,
    );
    expect(screen.getByText('Done step')).toBeTruthy();
    expect(screen.getByText('Active step')).toBeTruthy();
    expect(screen.getByText('Todo step')).toBeTruthy();
  });

  it('composes row accessibility labels from label and detail', () => {
    render(<ProgressSteps steps={steps} />);
    expect(screen.getByLabelText('Video: No video')).toBeTruthy();
    expect(screen.getByLabelText('Tracking: Not started')).toBeTruthy();
  });
});
