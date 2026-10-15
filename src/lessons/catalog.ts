// Lesson titles for navigation (the lesson bodies load on demand).

export interface CatalogEntry {
  id: number;
  title: string;
  short: string;
  goal: string;
}

export const CATALOG: CatalogEntry[] = [
  { id: 0, title: 'Warm-up and vocabulary', short: 'Warm-up', goal: 'Combinational versus sequential logic, the clock edge, and what "single cycle" means.' },
  { id: 1, title: 'Fetch', short: 'Fetch', goal: 'The PC, instruction memory and the PC + 4 adder.' },
  { id: 2, title: 'R-type instructions', short: 'R-type', goal: 'Register file, ALU, write-back, RegWrite and ALU operation selection.' },
  { id: 3, title: 'I-type ALU instructions', short: 'I-type ALU', goal: 'Immediate generator, sign extension and the ALUSrc mux.' },
  { id: 4, title: 'Loads', short: 'Loads', goal: 'Data memory, address calculation, the write-back mux and byte loads.' },
  { id: 5, title: 'Stores', short: 'Stores', goal: 'The split S-type immediate, MemWrite and byte enables.' },
  { id: 6, title: 'Branches, part 1: beq', short: 'beq', goal: 'Branch adder, Zero flag, PCSrc and the PC mux.' },
  { id: 7, title: 'Branches, part 2', short: 'All branches', goal: 'How funct3 drives the condition logic; signed versus unsigned.' },
  { id: 8, title: 'Jumps: jal and jalr', short: 'Jumps', goal: 'Linking PC + 4, the Jump signal and the jalr target.' },
  { id: 9, title: 'lui and auipc', short: 'lui, auipc', goal: 'U-type immediates and the ALU input-A choice.' },
  { id: 10, title: 'The control unit', short: 'Control unit', goal: 'Derive the main decoder, the ALU decoder and the gate-level logic.' },
  { id: 11, title: 'The complete machine', short: 'Complete machine', goal: 'The full datapath running real programs.' },
  { id: 12, title: 'Timing', short: 'Timing', goal: 'Critical paths, the minimum clock period and why single-cycle is slow.' },
  { id: 13, title: 'Verilog view', short: 'Verilog', goal: 'Synthesizable Verilog for every block, linked to the diagram.' },
  { id: 14, title: 'Interview preparation', short: 'Interview prep', goal: 'Realistic questions with model answers.' },
];
