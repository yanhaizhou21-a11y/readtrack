/**
 * Synthetic document fixtures and adversarial test payloads for ReadTrack E2E tests.
 */

export interface TestFixture {
  filename: string;
  extension: "txt" | "md" | "pdf" | "epub" | "docx";
  content: string | Buffer;
  sizeBytes: number;
  expectedTitle: string;
  expectedWordCount?: number;
  expectedSectionCount?: number;
}

export const VALID_TXT_CONTENT = `Chapter 1: The Beginning
In the quiet town of Veridia, the morning fog clung to the cobblestone streets like a silver veil.
The old library stood at the corner of Merchant and Elm, its weathered cedar doors slightly ajar.
Inside, thousands of volumes rested on walnut shelves, their pages carrying echoes of distant epochs.

Chapter 2: The Discovery
Elena climbed the spiral iron staircase to the archives mezzanine.
Behind a row of cartography folios, a leather-bound journal caught her eye.
Its pages were inscribed with geometric constellations and notes on temporal mechanics.
She turned the brittle pages with deliberate care, noting the fading sepia ink.

Chapter 3: The Departure
By nightfall, the autumn wind had scattered the fallen maple leaves across the square.
With the journal secured inside her satchel, she stepped into the train station.
The midnight express whistled softly in the distance, ready to depart for the capital.`;

export const VALID_MD_CONTENT = `# Quantum Computing Architecture

An introductory treatise on quantum information and coherence.

## Fundamentals of Qubits

A qubit represents a two-state quantum-mechanical system.
Unlike classical bits, which are strictly zero or one, qubits can exist in linear superpositions.
This mathematical property enables massive quantum parallelism in algorithms like Shor and Grover.

- Coherence time: T1 and T2 relaxation limits
- Gate fidelity: Fault-tolerant thresholds exceeding 99.9%
- Error correction: Surface codes and color codes

## Superconducting Circuits

Superconducting transmon qubits utilize Josephson junctions operating at millikelvin temperatures.
Dilution refrigerators maintain ambient temperatures below 15 mK to suppress thermal excitations.

> "Quantum supremacy marks the milestone where programmable quantum processors outperform classical supercomputers in targeted sampling tasks."

### Algorithmic Benchmarks

Recent experiments demonstrate verifiable advantage in random circuit sampling and boson sampling.
Future horizons include quantum chemistry simulation for nitrogenase catalysis.`;

export const FAKE_PDF_CONTENT = `This is definitely not a PDF file. It is plain text masquerading as a PDF document.`;

export const CORRUPT_BINARY_CONTENT = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0xfe, 0x01, 0x02, 0x03]);

export const PDF_MAGIC_BYTES = Buffer.from("%PDF-1.4\n%âãÏÓ\n1 0 obj\n<< /Title (Introduction to Distributed Systems) >>\nendobj\ntrailer\n<< /Size 1 >>\nstartxref\n0\n%%EOF");

export const PATH_TRAVERSAL_PAYLOADS = [
  "../../../../etc/passwd",
  "..\\..\\..\\..\\Windows\\System32\\drivers\\etc\\hosts",
  "library/documents/../../secret.key",
  "/var/log/system.log",
  "C:\\Program Files\\Malicious\\app.exe",
  "\x00hidden_traversal.txt",
];

export const STRING_BOUNDARY_TITLES = {
  empty: "",
  singleChar: "A",
  valid50Chars: "A".repeat(50),
  boundary200Chars: "X".repeat(200),
  overflow201Chars: "Y".repeat(201),
  overflow1000Chars: "Z".repeat(1000),
};

export const MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024; // 209,715,200 bytes
export const OVERFLOW_FILE_SIZE_BYTES = MAX_FILE_SIZE_BYTES + 1024; // 209,716,224 bytes
