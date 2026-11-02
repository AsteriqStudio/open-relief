# Mobile color system

Open Relief now uses a restrained navy and blue palette instead of treating green as the product identity. Financial and relief products need calm hierarchy more than a decorative “good news” color.

## Research principles used

- **Color has a job.** Blue identifies navigation, actions, and selected controls. Green is reserved for a completed or positive state. Amber and rose communicate review and error states.
- **Text remains readable without color alone.** Status labels use words, icons, and borders as well as hue.
- **Contrast is a release criterion.** The primary text, muted text, action text, primary button, warning, and error pairs meet or exceed the WCAG 2.2 AA 4.5:1 target for normal text. The lowest tested pair is dark text on selected blue at 4.92:1.
- **Keep the palette small.** One action family, neutral slate surfaces, and two state families make real account and creditor information feel less like a game.

## Token roles

| Role | Color | Use |
| --- | --- | --- |
| Canvas | `#0C1220` | Page background and dark text on pale calls to action |
| Surface | `#151F31` | Cards and bottom navigation |
| Inset | `#101827` | Inputs and nested areas |
| Ink | `#F8FAFC` | Primary text |
| Muted | `#AAB7CA` | Supporting text |
| Action | `#4F7FE7` | Selected controls, focus, and progress |
| Action light | `#B8CCFF` | Calls to action and action text on dark surfaces |
| Success | `#67D6A4` | Settlement or review success, never generic navigation |
| Warning | `#F2C36B` | Review and time-sensitive notices |
| Error | `#FB8B9A` | Rejection and errors |

The redesigned palette is applied through NativeWind tokens and the shared mobile design components, so donor, recipient, reviewer, authentication, and profile screens use the same hierarchy.
