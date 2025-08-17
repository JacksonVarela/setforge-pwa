// src/components/Templates.jsx
import React from "react";

const TEMPLATES = [
  {
    name: "Full Body • 3×/wk (Beginners)",
    days: [
      {
        name: "Full A",
        exercises: [
          { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", cat: "compound", group: "lower" },
          { name: "Bench Press", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "push" },
          { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
          { name: "Dumbbell Row", sets: 2, low: 8, high: 12, equip: "dumbbell", cat: "compound", group: "pull" },
          { name: "Plank", sets: 2, low: 30, high: 60, equip: "bodyweight", cat: "isolation", group: "core" }
        ]
      },
      {
        name: "Full B",
        exercises: [
          { name: "Deadlift (RDL)", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "lower" },
          { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "push" },
          { name: "Seated Row", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
          { name: "Leg Curl", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" },
          { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" }
        ]
      },
      {
        name: "Full C",
        exercises: [
          { name: "Front Squat or Hack Squat", sets: 3, low: 6, high: 10, equip: "machine", cat: "compound", group: "lower" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", cat: "compound", group: "push" },
          { name: "Pull-ups or Assisted", sets: 3, low: 6, high: 10, equip: "bodyweight", cat: "compound", group: "pull" },
          { name: "Lateral Raise", sets: 2, low: 12, high: 20, equip: "dumbbell", cat: "isolation", group: "push" },
          { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", cat: "isolation", group: "pull" }
        ]
      }
    ]
  },
  {
    name: "Upper/Lower • 4×/wk",
    days: [
      {
        name: "Upper A",
        exercises: [
          { name: "Bench Press", sets: 3, low: 5, high: 8, equip: "barbell", cat: "compound", group: "push" },
          { name: "Weighted Pull-ups", sets: 3, low: 5, high: 8, equip: "bodyweight", cat: "compound", group: "pull" },
          { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", cat: "compound", group: "push" },
          { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
          { name: "Lateral Raise", sets: 2, low: 12, high: 20, equip: "dumbbell", cat: "isolation", group: "push" }
        ]
      },
      {
        name: "Lower A",
        exercises: [
          { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", cat: "compound", group: "lower" },
          { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "lower" },
          { name: "Leg Press", sets: 2, low: 10, high: 15, equip: "machine", cat: "compound", group: "lower" },
          { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" }
        ]
      },
      {
        name: "Upper B",
        exercises: [
          { name: "Overhead Press", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "push" },
          { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
          { name: "Dips (Weighted if strong)", sets: 3, low: 6, high: 10, equip: "bodyweight", cat: "compound", group: "push" },
          { name: "Cable Row", sets: 3, low: 8, high: 12, equip: "cable", cat: "compound", group: "pull" },
          { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", cat: "isolation", group: "pull" }
        ]
      },
      {
        name: "Lower B",
        exercises: [
          { name: "Deadlift (RDL or Trap Bar)", sets: 3, low: 3, high: 6, equip: "barbell", cat: "compound", group: "lower" },
          { name: "Bulgarian Split Squat", sets: 3, low: 8, high: 12, equip: "dumbbell", cat: "compound", group: "lower" },
          { name: "Leg Curl", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" },
          { name: "Abs: Cable Crunch", sets: 2, low: 10, high: 15, equip: "cable", cat: "isolation", group: "core" }
        ]
      }
    ]
  },
  {
    name: "PPL • 6×/wk (High-volume)",
    days: [
      { name: "Push A", exercises: [
        { name: "Bench Press", sets: 3, low: 5, high: 8, equip: "barbell", cat: "compound", group: "push" },
        { name: "Incline DB Press", sets: 3, low: 8, high: 12, equip: "dumbbell", cat: "compound", group: "push" },
        { name: "Overhead Press", sets: 2, low: 6, high: 10, equip: "barbell", cat: "compound", group: "push" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", cat: "isolation", group: "push" }
      ]},
      { name: "Pull A", exercises: [
        { name: "Weighted Pull-ups", sets: 3, low: 5, high: 8, equip: "bodyweight", cat: "compound", group: "pull" },
        { name: "Chest-Supported Row", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
        { name: "Cable Row", sets: 2, low: 10, high: 15, equip: "cable", cat: "compound", group: "pull" },
        { name: "Cable Curl", sets: 2, low: 10, high: 15, equip: "cable", cat: "isolation", group: "pull" }
      ]},
      { name: "Legs A", exercises: [
        { name: "Back Squat", sets: 3, low: 5, high: 8, equip: "barbell", cat: "compound", group: "lower" },
        { name: "Romanian Deadlift", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "lower" },
        { name: "Leg Press", sets: 2, low: 10, high: 15, equip: "machine", cat: "compound", group: "lower" },
        { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" }
      ]},
      { name: "Push B", exercises: [
        { name: "Incline Barbell Press", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "push" },
        { name: "Weighted Dips", sets: 3, low: 6, high: 10, equip: "bodyweight", cat: "compound", group: "push" },
        { name: "Lateral Raise", sets: 3, low: 12, high: 20, equip: "dumbbell", cat: "isolation", group: "push" }
      ]},
      { name: "Pull B", exercises: [
        { name: "Barbell Row", sets: 3, low: 6, high: 10, equip: "barbell", cat: "compound", group: "pull" },
        { name: "Lat Pulldown", sets: 3, low: 8, high: 12, equip: "machine", cat: "compound", group: "pull" },
        { name: "Face Pull", sets: 2, low: 12, high: 20, equip: "cable", cat: "isolation", group: "pull" }
      ]},
      { name: "Legs B", exercises: [
        { name: "Front Squat or Hack", sets: 3, low: 6, high: 10, equip: "machine", cat: "compound", group: "lower" },
        { name: "Leg Curl", sets: 3, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" },
        { name: "Calf Raise", sets: 2, low: 10, high: 15, equip: "machine", cat: "isolation", group: "lower" }
      ]}
    ]
  }
];

export default function Templates({ onUse }) {
  return (
    <section className="grid gap-4">
      {TEMPLATES.map((t) => (
        <article key={t.name} className="glass p-4 rounded-2xl border border-neutral-800">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{t.name}</h3>
            <button className="btn-primary" onClick={() => onUse(t)}>Use</button>
          </div>
          <div className="mt-2 text-sm text-neutral-300">
            {t.days.length} days • balanced volume • progress via load/reps toward the top of range; push close to failure on final set.
          </div>
        </article>
      ))}
    </section>
  );
}
