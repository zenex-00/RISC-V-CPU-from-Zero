"use strict";(()=>{function t(e){return typeof window<"u"&&window.__rvLesson&&window.__rvLesson(e),e}var a=["pc","imem","pcadd","four","rf","immgen","srcamux","zero","srcbmux","alu","brcond","andg","org","dmem","stalign","ldext","resmux","bradd","clr0","tgtmux","pcmux","ctrl"],r=a.filter(e=>e!=="ctrl"&&e!=="imem"&&e!=="dmem"),s=[{name:"riscv_single",comps:a,summary:"Top level: the core plus separate instruction and data memories (Harvard organisation).",code:`// Single-cycle RV32I processor: core + memories.
module riscv_single (
  input wire clk,
  input wire reset
);
  wire [31:0] pc, instr, addr, wdata, rword;
  wire [3:0]  be;
  wire        memwrite, memread;

  core cpu (.clk(clk), .reset(reset), .pc(pc), .instr(instr),
            .addr(addr), .wdata(wdata), .be(be),
            .memwrite(memwrite), .memread(memread), .rword(rword));
  imem im  (.a(pc), .rd(instr));
  dmem dm  (.clk(clk), .we(memwrite), .re(memread), .be(be),
            .a(addr), .wd(wdata), .rd(rword));
endmodule`,testbench:"Load a program (for example the sum loop) into instruction memory with $readmemh, release reset, run a fixed number of cycles, then check register values through hierarchical references. Stronger: run the same program in an ISA reference model and compare the register file after every instruction (lock-step comparison)."},{name:"core",comps:[...r,"ctrl"],summary:"Controller plus datapath. Everything except the memories.",code:`module core (
  input  wire        clk, reset,
  output wire [31:0] pc,
  input  wire [31:0] instr,
  output wire [31:0] addr, wdata,
  output wire [3:0]  be,
  output wire        memwrite, memread,
  input  wire [31:0] rword
);
  wire       regwrite, alusrc, branch, jump, pctargetsrc;
  wire [2:0] immsrc;
  wire [1:0] alusrca, resultsrc;
  wire [3:0] alucontrol;

  controller c (.op(instr[6:0]), .funct3(instr[14:12]), .b30(instr[30]),
                .regwrite(regwrite), .immsrc(immsrc), .alusrca(alusrca),
                .alusrc(alusrc), .memread(memread), .memwrite(memwrite),
                .resultsrc(resultsrc), .branch(branch), .jump(jump),
                .pctargetsrc(pctargetsrc), .alucontrol(alucontrol));

  datapath dp (.clk(clk), .reset(reset), .instr(instr), .pc(pc),
               .regwrite(regwrite), .immsrc(immsrc), .alusrca(alusrca),
               .alusrc(alusrc), .resultsrc(resultsrc), .branch(branch),
               .jump(jump), .pctargetsrc(pctargetsrc), .alucontrol(alucontrol),
               .addr(addr), .wdata(wdata), .be(be), .rword(rword));
endmodule`,testbench:"Usually tested through the top level. A useful unit test drives instr directly with hand-made words and a fake memory, and checks pc, addr, wdata and be for each instruction class."},{name:"controller",comps:["ctrl"],summary:"Main decoder plus ALU decoder.",code:`module controller (
  input  wire [6:0] op,
  input  wire [2:0] funct3,
  input  wire       b30,          // instr[30] = funct7[5]
  output wire       regwrite, alusrc, memread, memwrite,
  output wire       branch, jump, pctargetsrc,
  output wire [2:0] immsrc,
  output wire [1:0] alusrca, resultsrc,
  output wire [3:0] alucontrol
);
  wire [1:0] aluop;
  maindec md (.op(op), .regwrite(regwrite), .immsrc(immsrc), .alusrca(alusrca),
              .alusrc(alusrc), .memread(memread), .memwrite(memwrite),
              .resultsrc(resultsrc), .branch(branch), .jump(jump),
              .pctargetsrc(pctargetsrc), .aluop(aluop));
  aludec  ad (.aluop(aluop), .funct3(funct3), .b30(b30), .alucontrol(alucontrol));
endmodule`,testbench:"Table-driven: for every instruction in RV32I, apply its opcode, funct3 and bit 30 and compare all outputs with the truth table, skipping don't-care entries."},{name:"maindec",comps:["ctrl"],summary:"The main decoder truth table, written as a case statement.",code:`module maindec (
  input  wire [6:0] op,
  output reg        regwrite, alusrc, memread, memwrite,
  output reg        branch, jump, pctargetsrc,
  output reg  [2:0] immsrc,     // 000 I, 001 S, 010 B, 011 J, 100 U
  output reg  [1:0] alusrca,    // 00 rs1, 01 PC, 10 zero
  output reg  [1:0] resultsrc,  // 00 ALU, 01 memory, 10 PC+4
  output reg  [1:0] aluop       // 00 add, 01 sub, 10 R-type, 11 I-type
);
  always @(*) begin
    // Defaults: write nothing, PC + 4. Don't-cares are driven as 0.
    {regwrite, immsrc, alusrca, alusrc, memread, memwrite,
     resultsrc, branch, jump, pctargetsrc, aluop} = 16'b0;
    case (op)
      7'b0110011: begin regwrite = 1; aluop = 2'b10; end                       // R-type
      7'b0010011: begin regwrite = 1; alusrc = 1; aluop = 2'b11; end           // I-type ALU
      7'b0000011: begin regwrite = 1; alusrc = 1; memread = 1;
                        resultsrc = 2'b01; end                                  // load
      7'b0100011: begin immsrc = 3'b001; alusrc = 1; memwrite = 1; end         // store
      7'b1100011: begin immsrc = 3'b010; branch = 1; aluop = 2'b01; end        // branch
      7'b1101111: begin regwrite = 1; immsrc = 3'b011; resultsrc = 2'b10;
                        jump = 1; end                                           // jal
      7'b1100111: begin regwrite = 1; alusrc = 1; resultsrc = 2'b10;
                        jump = 1; pctargetsrc = 1; end                          // jalr
      7'b0110111: begin regwrite = 1; immsrc = 3'b100; alusrca = 2'b10;
                        alusrc = 1; end                                         // lui
      7'b0010111: begin regwrite = 1; immsrc = 3'b100; alusrca = 2'b01;
                        alusrc = 1; end                                         // auipc
      default: ;                                                                // illegal: no state change
    endcase
  end
endmodule`,testbench:"Loop over the nine opcodes and compare each output with an expected vector, with a mask for don't-care bits. Also apply a few illegal opcodes and check that regwrite, memwrite, branch and jump are all 0."},{name:"aludec",comps:["ctrl"],summary:"ALU decoder: ALUOp, funct3 and bit 30 to the 4-bit ALU operation {sub/arith, funct3}.",code:`module aludec (
  input  wire [1:0] aluop,
  input  wire [2:0] funct3,
  input  wire       b30,
  output reg  [3:0] alucontrol      // {sub or arithmetic shift, funct3}
);
  always @(*)
    case (aluop)
      2'b00:   alucontrol = 4'b0000;                              // add
      2'b01:   alucontrol = 4'b1000;                              // sub (compare)
      2'b10:   alucontrol = {b30, funct3};                        // R-type
      default: alucontrol = {(funct3 == 3'b101) & b30, funct3};   // I-type
    endcase
endmodule`,testbench:"Exhaustive: 4 ALUOp values x 8 funct3 x 2 values of bit 30 = 64 cases, checked against a reference function. Make sure addi with bit 30 = 1 still gives add."},{name:"datapath",comps:r,summary:"Every datapath block wired together, exactly as in the diagram.",code:`module datapath (
  input  wire        clk, reset,
  input  wire [31:0] instr,
  output wire [31:0] pc,
  input  wire        regwrite, alusrc, branch, jump, pctargetsrc,
  input  wire [2:0]  immsrc,
  input  wire [1:0]  alusrca, resultsrc,
  input  wire [3:0]  alucontrol,
  output wire [31:0] addr, wdata,
  output wire [3:0]  be,
  input  wire [31:0] rword
);
  wire [31:0] pcnext, pcplus4, pcbranch, jtarget, target;
  wire [31:0] rd1, rd2, immext, srca, srcb, aluresult, loaddata, result;
  wire        zero, lt, ltu, take, pcsrc;

  // Next PC
  pc_reg      pcr (.clk(clk), .reset(reset), .d(pcnext), .q(pc));
  adder       a4  (.a(pc), .b(32'd4), .y(pcplus4));
  adder       ab  (.a(pc), .b(immext), .y(pcbranch));
  assign jtarget = {aluresult[31:1], 1'b0};                 // jalr clears bit 0
  mux2 #(32)  tm  (.d0(pcbranch), .d1(jtarget), .s(pctargetsrc), .y(target));
  branch_unit bu  (.funct3(instr[14:12]), .zero(zero), .lt(lt), .ltu(ltu), .take(take));
  assign pcsrc = jump | (branch & take);
  mux2 #(32)  pm  (.d0(pcplus4), .d1(target), .s(pcsrc), .y(pcnext));

  // Register file and immediate
  regfile     rf  (.clk(clk), .we3(regwrite), .a1(instr[19:15]), .a2(instr[24:20]),
                   .a3(instr[11:7]), .wd3(result), .rd1(rd1), .rd2(rd2));
  imm_gen     ig  (.instr(instr[31:7]), .immsrc(immsrc), .immext(immext));

  // ALU
  mux3 #(32)  am  (.d0(rd1), .d1(pc), .d2(32'd0), .s(alusrca), .y(srca));
  mux2 #(32)  bm  (.d0(rd2), .d1(immext), .s(alusrc), .y(srcb));
  alu         au  (.a(srca), .b(srcb), .alucontrol(alucontrol), .y(aluresult),
                   .zero(zero), .lt(lt), .ltu(ltu));

  // Memory interface
  assign addr = aluresult;
  store_unit  su  (.rs2(rd2), .offset(aluresult[1:0]), .funct3(instr[14:12]),
                   .wd(wdata), .be(be));
  load_ext    le  (.word(rword), .offset(aluresult[1:0]), .funct3(instr[14:12]),
                   .y(loaddata));

  // Write-back
  mux3 #(32)  rm  (.d0(aluresult), .d1(loaddata), .d2(pcplus4), .s(resultsrc), .y(result));
endmodule`,testbench:'Drive the control inputs by hand (as in the "Set the control signals" exercise) with a known register file and memory, and check pcnext, result and the memory outputs. Every mistake in that exercise is a test case.'},{name:"pc_reg",comps:["pc"],summary:"32 D flip-flops with a synchronous reset to the start address.",code:`module pc_reg #(parameter RESET_PC = 32'h0000_0000) (
  input  wire        clk, reset,
  input  wire [31:0] d,
  output reg  [31:0] q
);
  always @(posedge clk)
    if (reset) q <= RESET_PC;
    else       q <= d;
endmodule`,testbench:"Assert reset and check q = RESET_PC after an edge. Then change d between edges and check that q only follows d at rising edges."},{name:"adder",comps:["pcadd","bradd"],summary:"A 32-bit adder. Synthesis picks ripple-carry, carry-lookahead or a faster structure to meet timing.",code:`module adder (
  input  wire [31:0] a, b,
  output wire [31:0] y
);
  assign y = a + b;   // carry out is not needed for addresses
endmodule`,testbench:"Random vectors against a + b computed in the testbench, plus corners: 0xFFFFFFFF + 1 (wraps to 0), 0x7FFFFFFF + 1, and adding negative offsets."},{name:"mux2",comps:["srcbmux","pcmux","tgtmux"],summary:"Parameterised 2-to-1 multiplexer.",code:`module mux2 #(parameter W = 32) (
  input  wire [W-1:0] d0, d1,
  input  wire         s,
  output wire [W-1:0] y
);
  assign y = s ? d1 : d0;
endmodule`,testbench:"Put distinct patterns on d0 and d1 (for example 0xAAAAAAAA and 0x55555555), toggle s, and check y each time."},{name:"mux3",comps:["srcamux","resmux"],summary:"Parameterised 3-to-1 multiplexer with a 2-bit select.",code:`module mux3 #(parameter W = 32) (
  input  wire [W-1:0] d0, d1, d2,
  input  wire [1:0]   s,
  output wire [W-1:0] y
);
  assign y = s[1] ? d2 : (s[0] ? d1 : d0);   // s = 11 also selects d2
endmodule`,testbench:"Three distinct patterns on the inputs, all four select values. Document that s = 11 selects d2."},{name:"regfile",comps:["rf"],summary:"Two combinational read ports, one write port clocked at the rising edge. x0 is not stored.",code:`module regfile (
  input  wire        clk, we3,
  input  wire [4:0]  a1, a2, a3,
  input  wire [31:0] wd3,
  output wire [31:0] rd1, rd2
);
  reg [31:0] rf [31:1];                 // x1..x31; x0 has no storage

  always @(posedge clk)
    if (we3 && a3 != 5'd0) rf[a3] <= wd3;

  assign rd1 = (a1 == 5'd0) ? 32'd0 : rf[a1];
  assign rd2 = (a2 == 5'd0) ? 32'd0 : rf[a2];
endmodule`,testbench:"Write a unique value to every register, read them back on both ports; write x0 and check it still reads 0; read and write the same register in one cycle and check the read returns the old value until the edge."},{name:"imm_gen",comps:["immgen"],summary:"Rebuilds and sign-extends the immediate for each format. Bit 31 is always the sign.",code:`module imm_gen (
  input  wire [31:7] instr,
  input  wire [2:0]  immsrc,
  output reg  [31:0] immext
);
  always @(*)
    case (immsrc)
      3'b000:  immext = {{20{instr[31]}}, instr[31:20]};                                // I
      3'b001:  immext = {{20{instr[31]}}, instr[31:25], instr[11:7]};                   // S
      3'b010:  immext = {{20{instr[31]}}, instr[7], instr[30:25], instr[11:8], 1'b0};   // B
      3'b011:  immext = {{12{instr[31]}}, instr[19:12], instr[20], instr[30:21], 1'b0}; // J
      3'b100:  immext = {instr[31:12], 12'b0};                                           // U
      default: immext = 32'bx;                                                           // unused
    endcase
endmodule`,testbench:"For each format, encode immediates such as -1, 0, the maximum, the minimum and a value with alternating bits, and check immext. The course's own tests compare this wiring with a second implementation on 5000 random words."},{name:"alu",comps:["alu"],summary:"One adder does add and subtract (invert B, carry-in 1). Flags LT = N xor V and LTU = not carry-out come from the same subtraction.",code:`module alu (
  input  wire [31:0] a, b,
  input  wire [3:0]  alucontrol,
  output reg  [31:0] y,
  output wire        zero, lt, ltu
);
  // Subtract for sub, slt and sltu: a + ~b + 1.
  wire        sub = (alucontrol == 4'b1000) | (alucontrol == 4'b0010) | (alucontrol == 4'b0011);
  wire [31:0] bb  = sub ? ~b : b;
  wire [32:0] sum = {1'b0, a} + {1'b0, bb} + {32'd0, sub};
  wire        v   = (a[31] == bb[31]) & (sum[31] != a[31]);   // signed overflow
  assign lt  = sum[31] ^ v;                                    // signed a < b
  assign ltu = ~sum[32];                                       // unsigned a < b (borrow)

  always @(*)
    case (alucontrol)
      4'b0000, 4'b1000: y = sum[31:0];                  // add, sub
      4'b0001:          y = a << b[4:0];                // sll
      4'b0010:          y = {31'd0, lt};                // slt
      4'b0011:          y = {31'd0, ltu};               // sltu
      4'b0100:          y = a ^ b;                      // xor
      4'b0101:          y = a >> b[4:0];                // srl
      4'b1101:          y = $signed(a) >>> b[4:0];      // sra
      4'b0110:          y = a | b;                      // or
      4'b0111:          y = a & b;                      // and
      default:          y = 32'd0;
    endcase

  assign zero = (y == 32'd0);
endmodule`,testbench:"Random a and b for every operation against a behavioural model ($signed comparisons, >>> for sra). Add overflow corners for slt: 0x7FFFFFFF vs -1, 0x80000000 vs 1, equal operands. For branches, check zero, lt and ltu while alucontrol = sub."},{name:"branch_unit",comps:["brcond","andg","org"],summary:"Chooses the branch condition with funct3. (PCSrc = jump | branch & take is in the datapath.)",code:`module branch_unit (
  input  wire [2:0] funct3,
  input  wire       zero, lt, ltu,
  output wire       take
);
  // funct3[2]: equality or less-than; funct3[1]: signed or unsigned; funct3[0]: invert
  wire cond = funct3[2] ? (funct3[1] ? ltu : lt) : zero;
  assign take = cond ^ funct3[0];
endmodule`,testbench:"Exhaustive: 8 funct3 values x 8 combinations of zero, lt, ltu = 64 cases. Then a system test: random register pairs for all six branches against a C-like reference."},{name:"store_unit",comps:["stalign"],summary:"Replicates the byte or halfword across lanes and sets the byte enables.",code:`module store_unit (
  input  wire [31:0] rs2,
  input  wire [1:0]  offset,      // address bits 1:0
  input  wire [2:0]  funct3,
  output reg  [31:0] wd,
  output reg  [3:0]  be
);
  always @(*)
    case (funct3[1:0])
      2'b00:   begin wd = {4{rs2[7:0]}};  be = 4'b0001 << offset;               end  // sb
      2'b01:   begin wd = {2{rs2[15:0]}}; be = 4'b0011 << {offset[1], 1'b0};    end  // sh
      default: begin wd = rs2;            be = 4'b1111;                         end  // sw
    endcase
endmodule`,testbench:"Exhaustive over funct3 (sb, sh, sw) and offset, with rs2 = 0x11223344: check be and wd. Misaligned combinations (sh at odd offsets, sw at non-zero offsets) must be caught elsewhere (a trap) or documented as unsupported."},{name:"load_ext",comps:["ldext"],summary:"Selects the byte or halfword lane and sign- or zero-extends it.",code:`module load_ext (
  input  wire [31:0] word,        // aligned word from memory
  input  wire [1:0]  offset,      // address bits 1:0
  input  wire [2:0]  funct3,
  output reg  [31:0] y
);
  wire [31:0] shifted = word >> {offset, 3'b000};
  wire [7:0]  b = shifted[7:0];
  wire [15:0] h = offset[1] ? word[31:16] : word[15:0];

  always @(*)
    case (funct3)
      3'b000:  y = {{24{b[7]}}, b};      // lb
      3'b001:  y = {{16{h[15]}}, h};     // lh
      3'b100:  y = {24'd0, b};           // lbu
      3'b101:  y = {16'd0, h};           // lhu
      default: y = word;                 // lw
    endcase
endmodule`,testbench:"Use a word with a negative and a positive byte in each half, such as 0x80FF7F01. For every funct3 and offset, compare with the expected extension."},{name:"imem",comps:["imem"],summary:"Instruction memory: 1024 words, combinational read, loaded from a hex file.",code:`module imem (
  input  wire [31:0] a,
  output wire [31:0] rd
);
  reg [31:0] ram [0:1023];
  initial $readmemh("program.hex", ram);   // one 32-bit word per line
  assign rd = ram[a[11:2]];                // word index; a[1:0] is 00
endmodule`,testbench:"Load a known hex file and read every address. In FPGAs this becomes a block RAM or ROM; many block RAMs have a registered (clocked) read, which a single-cycle design cannot use as is."},{name:"dmem",comps:["dmem"],summary:"Data memory: 4 KiB, combinational read, byte-enabled write at the clock edge.",code:`module dmem (
  input  wire        clk, we, re,
  input  wire [3:0]  be,
  input  wire [31:0] a, wd,
  output wire [31:0] rd
);
  reg  [31:0] ram [0:1023];            // 0x1000 .. 0x1FFF
  wire [9:0]  i = a[11:2];

  assign rd = re ? ram[i] : 32'd0;

  always @(posedge clk)
    if (we) begin
      if (be[0]) ram[i][7:0]   <= wd[7:0];
      if (be[1]) ram[i][15:8]  <= wd[15:8];
      if (be[2]) ram[i][23:16] <= wd[23:16];
      if (be[3]) ram[i][31:24] <= wd[31:24];
    end
endmodule`,testbench:"Write each byte-enable pattern and read back; check bytes not enabled keep their old value; check rd is 0 when re = 0."},{name:"tb",comps:[],summary:"A minimal system testbench: run the sum program and check a0.",code:`\`timescale 1ns/1ps
module tb;
  reg clk = 0, reset = 1;
  riscv_single dut (.clk(clk), .reset(reset));

  always #5 clk = ~clk;                       // 10 ns period in simulation

  initial begin
    #12 reset = 0;                            // released after the first edge
    repeat (200) @(posedge clk);
    // The sum program leaves 1 + 2 + ... + 10 = 55 in a0 (x10).
    if (dut.cpu.dp.rf.rf[10] === 32'd55) $display("PASS: a0 = 55");
    else                                  $display("FAIL: a0 = %0d", dut.cpu.dp.rf.rf[10]);
    $finish;
  end
endmodule`,testbench:"Assemble the program with the course assembler (or GNU as), write the words to program.hex, and run with Icarus Verilog: iverilog -o sim *.v && vvp sim."}],o=t({id:13,title:"Verilog view",short:"Verilog",goal:"Synthesizable Verilog for every block, linked to the diagram.",level:11,scope:[],tool:"verilog",verilog:s,steps:[{title:"From diagram to hardware description",text:"Every block in the diagram becomes a Verilog module, and every wire becomes a net. The structure you have built is exactly the structure of the code.",camera:"fit",fadeIdle:!1},{title:"Combinational and sequential code",text:"Combinational blocks (muxes, ALU, decoders, immediate generator) are written with `assign` or `always @(*)` and assign every output on every path, so no latch is inferred. State (PC, register file, data memory writes) uses `always @(posedge clk)` with non-blocking assignments `<=`.",camera:"fit",fadeIdle:!1},{title:"The control unit is two small modules",text:'maindec is the truth table as a case statement; aludec is four lines. Default assignments at the top of the always block give the "no state change" behaviour for an illegal opcode.',camera:"fit",fadeIdle:!1,focus:["ctrl"]},{title:"Verification",text:"Each module comes with a testbench idea. The strongest check for a processor is lock-step comparison with an instruction-set reference model, which is how this course's simulator is tested too. Open the Verilog and diagram tab: click a module to highlight it, or click a block to see its code.",camera:"fit",fadeIdle:!1}],practice:[{kind:"quiz",title:"Verilog check",concepts:["verilog-seq","verilog-x0","verilog-latch","verilog-sra"]}]});})();
