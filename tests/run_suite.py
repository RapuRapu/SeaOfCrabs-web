import subprocess, sys, time, os
from concurrent.futures import ThreadPoolExecutor

FULL_SUITE = [
    'crab_combat', 'crab_gear', 'crab_hold', 'crab_camp', 'crab_reef', 'crab_water', 'crab_helpers',
    'crab_improve', 'crab_audio', 'crab_burrow', 'crab_drops', 'crab_travel', 'crab_reef_combat',
    'crab_inventory', 'crab_rack', 'crab_ui', 'crab_playthrough', 'crab_structures', 'crab_difficulty', 'crab_tunnels', 'crab_helper_combat', 'crab_follow', 'crab_fill_tap', 'crab_game_log', 'crab_pick', 'crab_map', 'crab_quick_slots', 'crab_helper_items', 'crab_combat_escape', 'crab_exit_manage', 'crab_hands',
]
LOG_FOLDER = '/tmp/suite'
WORKERS = int(os.environ.get('SUITE_WORKERS', '2'))


def run(test_name):
    started = time.time()
    with open(f'{LOG_FOLDER}/{test_name}.log', 'w') as log:
        exit_code = subprocess.call([sys.executable, f'tests/{test_name}.py'], stdout=log, stderr=subprocess.STDOUT, timeout=1200)
    return test_name, exit_code, round(time.time() - started)


if __name__ == '__main__':
    os.makedirs(LOG_FOLDER, exist_ok=True)
    selected = sys.argv[1:] or FULL_SUITE
    suite_started = time.time()
    failures = []
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for test_name, exit_code, seconds in pool.map(run, selected):
            print(f'{"PASS" if exit_code == 0 else "FAIL"}  {test_name}  {seconds} s', flush=True)
            if exit_code != 0:
                failures.append(test_name)
    print(f'{len(selected) - len(failures)}/{len(selected)} passed in {round(time.time() - suite_started)} s. Logs: {LOG_FOLDER}/<test>.log')
    if failures:
        print('Failed:', ' '.join(failures))
    sys.exit(1 if failures else 0)
