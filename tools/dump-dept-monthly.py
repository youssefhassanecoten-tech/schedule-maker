"""Dumps the department's binary .doc monthly schedule into JSON so the Node
comparison tool can read it without an OLE parser.

    python tools/dump-dept-monthly.py "C:\\...\\2_Oktyabr_2026_G__1.doc" dept-monthly.json
"""
import sys, re, json, struct
import olefile

DAYS = 6


def get_text(path):
    ole = olefile.OleFileIO(path)
    wd = ole.openstream('WordDocument').read()
    flags = struct.unpack_from('<H', wd, 0x0A)[0]
    name = '1Table' if (flags >> 9) & 1 else '0Table'
    tb = ole.openstream(name if ole.exists(name) else '0Table').read()
    fc_clx, lcb_clx = struct.unpack_from('<II', wd, 0x01A2)
    clx = tb[fc_clx:fc_clx + lcb_clx]
    i, pcdt = 0, None
    while i < len(clx):
        if clx[i] == 1:
            i += 3 + struct.unpack_from('<H', clx, i + 1)[0]
        elif clx[i] == 2:
            lcb = struct.unpack_from('<I', clx, i + 1)[0]
            pcdt = clx[i + 5:i + 5 + lcb]
            break
        else:
            break
    n = (len(pcdt) - 4) // 12
    cps = [struct.unpack_from('<I', pcdt, 4 * k)[0] for k in range(n + 1)]
    out = []
    for k in range(n):
        off = 4 * (n + 1) + 8 * k
        fc = struct.unpack_from('<I', pcdt, off + 2)[0]
        comp = (fc & 0x40000000) != 0
        real = fc & 0x3FFFFFFF
        cch = cps[k + 1] - cps[k]
        if comp:
            out.append(wd[real // 2: real // 2 + cch].decode('latin1'))
        else:
            out.append(wd[real: real + cch * 2].decode('utf-16-le'))
    return ''.join(out)


def flat(s):
    s = re.sub(r'[\u00a0\u2007\u202f\u2009]', ' ', str(s or ''))
    return re.sub(r'\s+', ' ', s).strip()


def main():
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else 'dept-monthly.json'
    C = get_text(src).split('\x07')
    NC = 26
    is_date = lambda s: bool(re.match(r'^\d\d\.\d\d\.?$', s.strip()))

    labels, weeks = [], []
    i = 0
    cur = None
    last_time = ''
    while i < len(C):
        if i + 8 < len(C) and all(is_date(C[i + 2 + k]) for k in range(DAYS)):
            dates = [C[i + 2 + k].strip() for k in range(DAYS)]
            wk = ''
            for k in range(2, 10):
                if 'неделя' in C[i + k]:
                    wk = flat(C[i + k])
            cur = {'week': wk, 'dates': dates, 'lessons': []}
            weeks.append(cur)
            i += 9
            continue
        if cur is None:
            i += 1
            continue
        if i + NC + 1 > len(C):
            break
        time = flat(C[i + 1])
        # The time label is merged down its whole row group, so only the first
        # row of each group carries it. Carry it forward within the week, the
        # way a reader of the table does.
        if time and re.match(r'^\d{1,2}[.:]\d\d', time):
            labels.append(time)
            last_time = time
        else:
            time = last_time
        for d in range(DAYS):
            g = flat(C[i + 2 + d * 4])
            t = flat(C[i + 3 + d * 4])
            r = flat(C[i + 4 + d * 4])
            tp = flat(C[i + 5 + d * 4])
            if g or t:
                cur['lessons'].append({'day': d, 'time': time, 'group': g,
                                       'teacher': t, 'room': r, 'topic': tp})
        i += NC + 1

    json.dump({'labels': labels, 'weeks': weeks}, open(dst, 'w', encoding='utf8'),
              ensure_ascii=False, indent=1)
    print('wrote', dst, '| labels', len(labels), '| weeks', len(weeks),
          '| lessons', sum(len(w['lessons']) for w in weeks))


if __name__ == '__main__':
    main()