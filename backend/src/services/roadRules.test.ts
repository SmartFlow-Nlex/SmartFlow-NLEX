import { isNotAllowed, roadRulesTool, roadRuleTopics } from './roadRules';
import type { RoadRuleTopic } from './roadRules';

const topicsOf = (message: string, earlier: string[] = []): RoadRuleTopic[] => roadRuleTopics(message, earlier);

describe('roadRuleTopics', () => {
  it("finds the e-bike in Ysa's example", () => {
    expect(topicsOf('I am using an E-Bike, where can I U-TURN or exit if i am coming from San Simon')).toEqual(
      expect.arrayContaining(['light_electric', 'u_turn']),
    );
  });

  it.each<[string, RoadRuleTopic]>([
    ['e-bike ako, saan pwede lumabas?', 'light_electric'],
    ['ebike allowed ba sa nlex', 'light_electric'],
    ['Pwede ba ang e bike?', 'light_electric'],
    ['can i use my bicycle on nlex', 'bicycle'],
    ['naka-bisikleta ako', 'bicycle'],
    ['pwede ba tricycle sa NLEX?', 'tricycle'],
    ['e-trike ko, pwede ba?', 'tricycle'],
    ['can I walk along the expressway?', 'on_foot'],
    ['125cc lang motor ko, pwede ba?', 'small_motorcycle'],
    ['is a 399 cc allowed?', 'small_motorcycle'],
    ['650cc big bike ko', 'motorcycle'],
    ['can motorcycles use NLEX?', 'motorcycle'],
    ['naka-motor ako, pwede ba?', 'motorcycle'],
    ['electric motorcycle ok ba?', 'electric_motorcycle'],
    ['can I ride my bike on NLEX?', 'bike_unclear'],
    ['Are jeepneys allowed on NLEX?', 'unlisted_vehicle'],
    ['where can I make a u-turn?', 'u_turn'],
    ['I missed my exit at Bocaue', 'u_turn'],
    ['nalampasan ko ang exit', 'u_turn'],
    ['can I reverse on the shoulder?', 'wrong_way'],
    ['what is the speed limit?', 'speed'],
    ['ano ang speed limit sa NLEX?', 'speed'],
    ['can I park on the shoulder?', 'stopping'],
    ['pwede ba huminto sa NLEX?', 'stopping'],
    ['my car broke down, who do I call?', 'breakdown'],
    ['nasiraan ako sa Marilao', 'breakdown'],
    ['what is the NLEX hotline?', 'breakdown'],
    ['which lane should I use to overtake?', 'lanes'],
    ['can trucks use the left lane?', 'lanes'],
    ['are buses allowed on NLEX?', 'trucks'],
    ['do you need rfid on nlex?', 'tolls'],
    ['how much is the toll fee?', 'tolls'],
    ['is a seatbelt required?', 'safety_laws'],
    ['What are the traffic rules on NLEX?', 'overview'],
    ['ano ang bawal sa NLEX?', 'overview'],
  ])('%s -> %s', (message, topic) => {
    expect(topicsOf(message)).toContain(topic);
  });

  it.each([
    'May traffic ba sa Bocaue?',
    'How is NLEX right now?',
    'Is San Fernando congested southbound?',
    'Ano ang takbo sa Bocaue ngayon?',
    'how fast is traffic moving at Marilao?',
    'Are trucks causing the jam at Balintawak?',
    'any stalled cars at Marilao?',
    'Salamat!',
    'What exits are there?',
    'is there an event at the Philippine Arena?',
    'where is it slow?',
  ])('leaves %s alone', (message) => {
    expect(topicsOf(message)).toEqual([]);
  });

  it('carries a barred vehicle into the follow-up about exits', () => {
    expect(topicsOf('so where do I exit then?', ['I am on an e-bike'])).toContain('light_electric');
    expect(topicsOf('saan ako lalabas?', ['e-bike ako'])).toContain('light_electric');
  });

  it('drops it once they have moved to something else', () => {
    expect(topicsOf('where do I exit in my car?', ['I am on an e-bike'])).toEqual([]);
    expect(topicsOf('where do I exit?', ['I am on an e-bike', 'ok I took my car instead'])).toEqual([]);
  });

  it('does not carry it into a traffic question', () => {
    expect(topicsOf('is there traffic at the Bocaue exit?', ['I am on an e-bike'])).toEqual([]);
  });

  it('does not reach back further than the last few questions', () => {
    const later = ['hi', 'how is Bocaue?', 'and Marilao?', 'thanks', 'and Dau?'];
    expect(topicsOf('where do I exit?', ['I am on an e-bike', ...later])).toEqual([]);
  });
});

describe('roadRulesTool', () => {
  it('answers an e-bike with the ban and nothing about U-turns', () => {
    const result = roadRulesTool({ topics: ['light_electric', 'u_turn'] }) as {
      fact: string;
      not_allowed: boolean;
    };
    expect(result.not_allowed).toBe(true);
    expect(result.fact).toMatch(/not allowed on NLEX/);
    expect(result.fact).not.toMatch(/U-turn/);
  });

  it('gives both rules when nothing is barred', () => {
    const result = roadRulesTool({ topics: ['speed', 'lanes'] }) as { fact: string; not_allowed: boolean };
    expect(result.not_allowed).toBe(false);
    expect(result.fact).toMatch(/100 km\/h/);
    expect(result.fact).toMatch(/center divider/);
  });

  it('takes the single topic the model sends', () => {
    expect((roadRulesTool({ topic: 'u_turn' }) as { fact: string }).fact).toMatch(/cannot U-turn/);
  });

  it('says so rather than guessing when it has nothing', () => {
    expect((roadRulesTool({ topic: 'made_up' }) as { fact: string }).fact).toMatch(/No road rule on file/);
    expect((roadRulesTool({}) as { fact: string }).fact).toMatch(/No road rule on file/);
  });

  it('treats only the vehicles that cannot use NLEX as barred', () => {
    expect(isNotAllowed('light_electric')).toBe(true);
    expect(isNotAllowed('small_motorcycle')).toBe(true);
    expect(isNotAllowed('motorcycle')).toBe(false);
    expect(isNotAllowed('trucks')).toBe(false);
  });
});
