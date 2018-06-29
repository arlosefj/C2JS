int test0(char *x, int width, int height) {
  return width;
}

int test1(char *x) {
  return x[1];
}

int test2(char *x) {
  x[3] = 1;
  return x[3];
}