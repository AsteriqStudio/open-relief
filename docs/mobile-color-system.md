# Mobile color system

Open Relief uses a professional light interface: white cards, soft-gray working surfaces, dark ink text, and a restrained blue action family. The palette avoids treating green as the product identity.

## Research principles used

- **Color has a job.** Blue identifies navigation, actions, and selected controls. Green is reserved for a completed or positive state. Amber and rose communicate review and error states.
- **Text remains readable without color alone.** Status labels use words, icons, and borders as well as hue.
- **Contrast is a release criterion.** The primary text, muted text, action text, primary button, warning, and error pairs meet or exceed the WCAG 2.2 AA 4.5:1 target for normal text. The lowest tested pair is dark text on selected blue at 4.92:1.
- **Keep the palette small.** One action family, neutral slate surfaces, and two state families make real account and creditor information feel less like a game.

## Token roles

| Role | Color | Use |
| --- | --- | --- |
| Canvas | `#F7F9FC` | Page background |
| Surface | `#FFFFFF` | Cards and bottom navigation |
| Inset | `#F1F5F9` | Inputs and nested areas |
| Ink | `#172033` | Primary text |
| Muted | `#64748B` | Supporting text |
| Action | `#185ADB` | Selected controls, focus, and progress |
| Action text | `#1F4FB5` | Links and primary calls to action |
| Success | `#15803D` | Settlement or review success, never generic navigation |
| Warning | `#9A4E0A` | Review and time-sensitive notices |
| Error | `#BE123C` | Rejection and errors |

The redesigned palette is applied through NativeWind tokens and the shared mobile design components, so donor, recipient, reviewer, authentication, and profile screens use the same hierarchy.
