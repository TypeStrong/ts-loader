$tests = Get-ChildItem ./test/comparison-tests -Directory | Where-Object {
  $name = $_.GetDirectories().Name
  $name -and $name.Contains('__snapshots__')
}

foreach ($test in $tests) {
  yarn jest --testRegex="$test/test.ts" --testTimeout=8000 --colors
}
