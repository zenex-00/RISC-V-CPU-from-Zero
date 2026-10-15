// Full-page lesson tools.
import type { LessonDef } from '../../lessons/types';
import { ControlLab } from './ControlLab';
import { Machine } from './Machine';
import { TimingLab } from './Timing';
import { VerilogView } from './Verilog';
import { InterviewBank } from './Interview';

export function LessonTool({ tool, lesson }: { tool: string; lesson: LessonDef }) {
  switch (tool) {
    case 'control':
      return <ControlLab />;
    case 'machine':
      return <Machine level={11} />;
    case 'timing':
      return <TimingLab />;
    case 'verilog':
      return <VerilogView modules={lesson.verilog ?? []} />;
    case 'interview':
      return <InterviewBank bank={lesson.bank ?? []} />;
  }
  return null;
}
