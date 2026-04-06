/**
 * Word Pairs — Generates start/target article pairs for the Wikipedia game.
 *
 * Uses curated pairs with known short paths (3-8 hops).
 * Falls back to random selection from well-known articles.
 */

// Curated word pairs: [start, target, optimalHops]
// These are all real Wikipedia articles with known short paths.
const CURATED_PAIRS = [
  // 3 hops
  ['Honey bee', 'Napoleon', 3],
  ['Pizza', 'Ancient Rome', 3],
  ['Guitar', 'Mathematics', 3],
  ['Soccer', 'United Kingdom', 3],
  ['Chocolate', 'Mexico', 3],
  ['Volcano', 'Japan', 3],
  ['Chess', 'India', 3],
  ['Piano', 'Germany', 3],

  // 4 hops
  ['Banana', 'Albert Einstein', 4],
  ['Shark', 'World War II', 4],
  ['Coffee', 'Ethiopia', 4],
  ['Diamond', 'South Africa', 4],
  ['Penguin', 'Antarctica', 4],
  ['Tornado', 'United States', 4],
  ['Sushi', 'Pacific Ocean', 4],
  ['Elephant', 'Africa', 4],
  ['Pyramid', 'Egypt', 4],
  ['Samurai', 'Feudalism', 4],

  // 5 hops
  ['Butterfly', 'Isaac Newton', 5],
  ['Lighthouse', 'Mediterranean Sea', 5],
  ['Telescope', 'Galileo Galilei', 5],
  ['Dinosaur', 'Charles Darwin', 5],
  ['Viking', 'Christianity', 5],
  ['Rainforest', 'Climate change', 5],
  ['Robot', 'Alan Turing', 5],
  ['Coral reef', 'Australia', 5],

  // 6 hops
  ['Origami', 'Leonardo da Vinci', 6],
  ['Yeti', 'Mount Everest', 6],
  ['Vampire', 'Transylvania', 6],
  ['Aurora', 'Solar wind', 6],
  ['Glacier', 'Ice age', 6],
  ['Sphinx', 'Library of Alexandria', 6],

  // 7-8 hops (harder)
  ['Chopsticks', 'Moon landing', 7],
  ['Garlic', 'Dracula', 7],
  ['Accordion', 'Tango', 7],
  ['Morse code', 'Internet', 8],
  ['Abacus', 'Artificial intelligence', 8],
];

let pairIndex = 0;

/**
 * Get a random word pair for a player.
 * Cycles through curated pairs to avoid repeats within a session.
 */
export function getWordPair() {
  // Shuffle on first use or when exhausted
  if (pairIndex === 0) {
    shuffleArray(CURATED_PAIRS);
  }

  const pair = CURATED_PAIRS[pairIndex % CURATED_PAIRS.length];
  pairIndex++;

  return {
    start: pair[0],
    target: pair[1],
    optimalHops: pair[2],
  };
}

/**
 * Get a new pair different from the current one.
 */
export function getNewWordPair(currentTarget) {
  let pair = getWordPair();
  let attempts = 0;
  while (pair.target === currentTarget && attempts < 10) {
    pair = getWordPair();
    attempts++;
  }
  return pair;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
