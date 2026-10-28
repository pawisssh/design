import { css } from '@linaria/core';

const checkboxCss = css`
  position: relative;
  border-style: solid;
`;

const markCss = css`
  display: flex;
`;

export const Checkbox = ({ checked }: CheckboxProps) => (
  <Box
    background={checked ? 'bgPrimary' : 'bg'}
    borderColor={checked ? 'bgPrimary' : 'bgLineHeavy'}
    borderRadius={100}
    borderWidth={100}
    className={checkboxCss}
  >
    <div className={markCss} style={{ opacity: checked ? 1 : 0 }}>
      <Icon color="fgInverse" name="checkmark" size="s" />
    </div>
  </Box>
);
