import re, sys, os

base = os.path.join(os.environ["TEMP"], "JollyLLM_statutes")


def load(name):
    with open(os.path.join(base, name + ".txt"), encoding="utf-8") as f:
        t = f.read()
    return re.sub(r"[ \t]+", " ", t)


def arrangement(text, limit=7000, skip=0):
    i = text.find("ARRANGEMENT OF SECTIONS")
    print(text[i + skip: i + limit])


def show(text, heading, n=1200, start=0):
    i = text.find(heading, start)
    print("=====", heading, "at", i)
    print(text[i: i + n] if i >= 0 else "NOT FOUND")
    print()


if __name__ == "__main__":
    cmd = sys.argv[1]
    name = sys.argv[2]
    t = load(name)
    if cmd == "arr":
        print(arrangement(t, int(sys.argv[3]) if len(sys.argv) > 3 else 7000,
                          int(sys.argv[4]) if len(sys.argv) > 4 else 0))
    elif cmd == "show":
        show(t, sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 1200,
             int(sys.argv[5]) if len(sys.argv) > 5 else 0)