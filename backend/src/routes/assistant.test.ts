import {
  asksAboutTraffic,
  asksAboutTrafficToo,
  inReplyLanguage,
  keepsTheFacts,
  plainlyInLanguage,
  saysNotAllowed,
  sentenceSayingNotAllowed,
  withEnglishDirections,
} from './assistant';

const EXITS = ['Balintawak', 'CDV/PH Arena', 'Bocaue Barrier', 'San Fernando', 'San Simon', 'Marilao'];

describe('inReplyLanguage', () => {
  it('catches a short Tagalog reply when the chat is in English', () => {
    expect(inReplyLanguage('Walang traffic.', 'english')).toBe(false);
    expect(inReplyLanguage('Salamat!', 'english')).toBe(false);
  });

  it('catches one Tagalog sentence inside an English reply', () => {
    expect(inReplyLanguage('Bocaue is clear right now. Walang traffic sa Marilao.', 'english')).toBe(false);
  });

  it('accepts plain English with exit names', () => {
    expect(inReplyLanguage('Bocaue northbound is clear right now.', 'english')).toBe(true);
    expect(inReplyLanguage('E-bikes are not allowed on the expressway.', 'english')).toBe(true);
    expect(inReplyLanguage('Traffic may ease at Sta. Rita Guiguinto.', 'english')).toBe(true);
  });

  it('catches an English sentence inside a Tagalog reply', () => {
    expect(inReplyLanguage('NLEX traffic is slow at Bocaue right now. May traffic sa Marilao.', 'tagalog')).toBe(false);
    expect(inReplyLanguage("You're welcome! Kung kailangan mo ng tulong, nandito ako.", 'tagalog')).toBe(false);
    expect(inReplyLanguage('May traffic sa Marilao. Safe travels!', 'tagalog')).toBe(false);
  });

  it('accepts natural Tagalog that keeps traffic words', () => {
    expect(inReplyLanguage('May traffic ngayon sa San Fernando papuntang Manila, mga 4 km/h lang ang takbo.', 'tagalog')).toBe(true);
    expect(inReplyLanguage('Bawal ang e-bike sa NLEX.', 'tagalog')).toBe(true);
    expect(inReplyLanguage('Walang anuman. Ingat sa biyahe.', 'tagalog')).toBe(true);
    expect(inReplyLanguage('Hi hi, Ysa! Ako si Navie, kasama mo sa NLEX.', 'tagalog')).toBe(true);
  });

  it('rejects the stiff words the style guide bans', () => {
    expect(inReplyLanguage('Ako si Navie, handang tumulong sa iyong paglalakbay sa NLEX.', 'tagalog')).toBe(false);
    expect(inReplyLanguage('Walang anuman. Mabuhay kayo.', 'tagalog')).toBe(false);
    expect(inReplyLanguage('Mas mababa ang limit sa lugar ng trabaho.', 'tagalog')).toBe(false);
  });
});

describe('plainlyInLanguage', () => {
  it('skips the model only when there is no doubt', () => {
    expect(plainlyInLanguage('Bocaue northbound is clear right now.', 'english')).toBe(true);
    expect(plainlyInLanguage('Walang traffic.', 'english')).toBe(false);
    expect(plainlyInLanguage('Clear', 'english')).toBe(false);
    expect(plainlyInLanguage('Bocaue northbound is clear right now.', 'tagalog')).toBe(false);
    expect(plainlyInLanguage('Walang traffic ngayon sa Bocaue.', 'tagalog')).toBe(true);
  });
});

describe('keepsTheFacts', () => {
  it('accepts a faithful translation, including a direction said in Tagalog', () => {
    expect(
      keepsTheFacts(
        'Traffic is heavy at San Fernando southbound right now, moving at about 4 km/h.',
        'May traffic ngayon sa San Fernando papuntang Manila, mga 4 km/h lang ang takbo.',
        EXITS,
      ),
    ).toBe(true);
  });

  it('rejects a changed, dropped or added number', () => {
    expect(keepsTheFacts('Bocaue is at 4 km/h.', 'Nasa 40 km/h sa Bocaue.', EXITS)).toBe(false);
    expect(keepsTheFacts('Bocaue is at 4 km/h.', 'May traffic sa Bocaue.', EXITS)).toBe(false);
    expect(keepsTheFacts('Bocaue is clear.', 'Clear sa Bocaue, 80 km/h.', EXITS)).toBe(false);
    expect(keepsTheFacts('Expect 10.5 km/h at 18:00.', 'Mga 10.5 km/h sa 18:00.', EXITS)).toBe(true);
    expect(keepsTheFacts('Expect 10.5 km/h at 18:00.', 'Mga 10 km/h sa 18:00.', EXITS)).toBe(false);
  });

  it('rejects a dropped exit', () => {
    expect(keepsTheFacts('Slow at Marilao and San Fernando.', 'Mabagal sa Marilao.', EXITS)).toBe(false);
  });

  it('accepts either way of naming an exit with two names', () => {
    expect(keepsTheFacts('Busy at CDV.', 'Maraming sasakyan sa Ph. Arena.', EXITS)).toBe(true);
  });

  it('rejects a direction turned round', () => {
    expect(keepsTheFacts('Bocaue northbound is clear.', 'Walang traffic sa Bocaue papuntang Manila.', EXITS)).toBe(false);
    expect(keepsTheFacts('Bocaue northbound is clear.', 'Walang traffic sa Bocaue papuntang Clark.', EXITS)).toBe(true);
  });
});

describe('withEnglishDirections', () => {
  it('puts the direction in English before the model sees it, so it cannot turn round', () => {
    expect(withEnglishDirections('Walang traffic ngayon sa Balagtas papuntang Manila, maluwag ang daan.')).toBe(
      'Walang traffic ngayon sa Balagtas southbound, maluwag ang daan.',
    );
    expect(withEnglishDirections('Mabagal sa Bocaue papuntang Clark at pa-norte sa Marilao.')).toBe(
      'Mabagal sa Bocaue northbound at northbound sa Marilao.',
    );
    expect(withEnglishDirections('Maluwag sa San Simon pa-Manila.')).toBe('Maluwag sa San Simon southbound.');
  });

  it('leaves the rest alone', () => {
    expect(withEnglishDirections('Maluwag ang daan sa Marilao, walang traffic.')).toBe('Maluwag ang daan sa Marilao, walang traffic.');
  });

  it('still passes the fact check against the original', () => {
    const original = 'Walang traffic ngayon sa Balagtas papuntang Manila, maluwag ang daan.';
    expect(keepsTheFacts(original, 'There is no traffic right now at Balagtas southbound, the road is clear.', ['Balagtas'])).toBe(true);
    expect(keepsTheFacts(original, 'There is no traffic right now on Balagtas northbound, the road is clear.', ['Balagtas'])).toBe(false);
  });
});

describe('traffic words', () => {
  it('does not take "traffic rules" for a question about the road', () => {
    expect(asksAboutTraffic('What are the traffic rules on NLEX?')).toBe(false);
    expect(asksAboutTrafficToo('What are the traffic rules on NLEX?')).toBe(false);
    expect(asksAboutTraffic('May traffic ba sa Bocaue?')).toBe(true);
  });

  it('tells a rule about heavy vehicles from a question about traffic', () => {
    expect(asksAboutTrafficToo('Can heavy trucks use NLEX?')).toBe(false);
    expect(asksAboutTrafficToo('Can motorcycles enter, and is there traffic at Bocaue?')).toBe(true);
  });
});

describe('saysNotAllowed', () => {
  it('recognises a refusal in either language', () => {
    expect(saysNotAllowed('E-bikes are not allowed on the expressway.')).toBe(true);
    expect(saysNotAllowed('Bawal ang e-bike sa NLEX.')).toBe(true);
    expect(saysNotAllowed('Hindi pinapayagan ang e-bike sa NLEX.')).toBe(true);
    expect(saysNotAllowed('You can exit at San Fernando.')).toBe(false);
  });

  it('keeps only the sentence that states the ban', () => {
    expect(
      sentenceSayingNotAllowed('E-bikes are not allowed on NLEX. You will need to exit at the nearest exit.'),
    ).toBe('E-bikes are not allowed on NLEX.');
    expect(sentenceSayingNotAllowed('Sorry! Bawal ang e-bike sa NLEX. Ingat!')).toBe('Bawal ang e-bike sa NLEX.');
    expect(sentenceSayingNotAllowed('You can exit at San Fernando.')).toBeNull();
    expect(sentenceSayingNotAllowed('')).toBeNull();
  });
});
