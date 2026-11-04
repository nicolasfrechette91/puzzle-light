/**
 * Designer-intended solutions for the sample levels, as `token@x,y` for every
 * piece that matters. The solver must find exactly these (and nothing else).
 */
export const SOLUTIONS: Record<string, string[]> = {
  't-01': ['M6~@3,2'],
  't-02': ['M1*@4,1'],
  't-03': ['M2*@2,1', 'M1*@2,5'],
  't-04': ['M7*@4,5'],
  't-05': ['M1*@4,1', 'M7*@4,3'],
  't-06': ['M1*@3,1', 'M7*@3,5'],
  'o-01': ['S2*@3,1'],
  'o-02': ['P0*@3,2'],
  'o-03': ['Fr*@4,1', 'Fb*@3,2'],
  'o-04': ['X*@3,1'],
  'o-05': ['M6*@5,3'],
  'o-06': ['M7*@4,1', 'M0*@3,4'],
};
